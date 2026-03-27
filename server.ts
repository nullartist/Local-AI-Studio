import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // --- File System & Git API Endpoints ---

  app.post("/api/fs/list", async (req, res) => {
    try {
      const { dir = "." } = req.body;
      const targetPath = path.resolve(process.cwd(), dir);
      try {
        const files = await fs.readdir(targetPath, { withFileTypes: true });
        const result = files.map(f => ({ name: f.name, isDirectory: f.isDirectory() }));
        res.json({ files: result });
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          res.json({ files: [] });
        } else {
          throw err;
        }
      }
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fs/read", async (req, res) => {
    try {
      const { path: filePath, start_line, end_line } = req.body;
      const content = await fs.readFile(path.resolve(process.cwd(), filePath), "utf-8");
      const lines = content.split("\n");
      let result = lines;
      if (start_line !== undefined && end_line !== undefined) {
        result = lines.slice(Math.max(0, start_line - 1), end_line);
      }
      const numbered = result.map((l, i) => `${(start_line || 1) + i}: ${l}`).join("\n");
      res.json({ content: numbered, total_lines: lines.length });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fs/write", async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      const fullPath = path.resolve(process.cwd(), filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf-8");
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fs/edit", async (req, res) => {
    try {
      const { path: filePath, start_line, end_line, replacement } = req.body;
      const fullPath = path.resolve(process.cwd(), filePath);
      const content = await fs.readFile(fullPath, "utf-8");
      const lines = content.split("\n");
      
      const before = lines.slice(0, start_line - 1);
      const after = lines.slice(end_line);
      const newLines = replacement.split("\n");
      
      const newContent = [...before, ...newLines, ...after].join("\n");
      await fs.writeFile(fullPath, newContent, "utf-8");
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fs/delete", async (req, res) => {
    try {
      const { path: filePath } = req.body;
      await fs.rm(path.resolve(process.cwd(), filePath), { recursive: true, force: true });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/fs/search", async (req, res) => {
    try {
      const { query, dir = "." } = req.body;
      const { stdout } = await execAsync(`grep -rnI "${query}" ${dir} || true`, { cwd: process.cwd() });
      res.json({ results: stdout });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/git", async (req, res) => {
    try {
      const { command } = req.body;
      await execAsync(`git rev-parse --is-inside-work-tree || git init`, { cwd: process.cwd() });
      const { stdout, stderr } = await execAsync(`git ${command}`, { cwd: process.cwd() });
      res.json({ stdout, stderr });
    } catch (e: any) { res.status(500).json({ error: e.message, stdout: e.stdout, stderr: e.stderr }); }
  });

  // --- Chat API Endpoint ---

  app.post("/api/chat", async (req, res) => {
    const { provider, model, messages, apiKey, baseUrl, temperature, systemInstruction, topP, maxTokens } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY || '' });
        
        const geminiMessages = messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : m.role,
          parts: [{ text: m.content }]
        }));

        const responseStream = await ai.models.generateContentStream({
          model: model,
          contents: geminiMessages,
          config: {
            systemInstruction: systemInstruction || undefined,
            temperature: temperature,
            topP: topP,
            maxOutputTokens: maxTokens,
          }
        });

        for await (const chunk of responseStream) {
          if (chunk.text) {
            res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
          }
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
      } else if (provider === 'openai' || provider === 'custom' || provider === 'ollama') {
        let url = 'https://api.openai.com/v1/chat/completions';
        if (provider === 'ollama') {
          url = `${baseUrl || 'http://localhost:11434'}/api/chat`;
        } else if (provider === 'custom') {
          url = baseUrl;
        }

        const headers: any = {
          'Content-Type': 'application/json',
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const openAiMessages = [];
        if (systemInstruction && provider !== 'ollama') {
          openAiMessages.push({ role: 'system', content: systemInstruction });
        }
        openAiMessages.push(...messages);

        const body: any = {
          model: model,
          messages: openAiMessages,
          stream: true
        };

        if (provider !== 'ollama') {
          if (temperature !== undefined) body.temperature = temperature;
          if (topP !== undefined) body.top_p = topP;
          if (maxTokens !== undefined) body.max_tokens = maxTokens;
        } else {
          body.options = {
            temperature: temperature,
            top_p: topP,
            num_predict: maxTokens
          };
          if (systemInstruction) {
            body.messages = [{ role: 'system', content: systemInstruction }, ...messages];
          }
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`API Error: ${response.status} ${err}`);
        }

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.trim() === '') continue;
              
              if (provider === 'ollama') {
                try {
                  const data = JSON.parse(line);
                  if (data.message && data.message.content) {
                    res.write(`data: ${JSON.stringify({ text: data.message.content })}\n\n`);
                  }
                  if (data.done) {
                    res.write(`data: [DONE]\n\n`);
                  }
                } catch (e) {
                  // ignore
                }
              } else {
                if (line.startsWith('data: ')) {
                  const dataStr = line.substring(6);
                  if (dataStr === '[DONE]') {
                    res.write(`data: [DONE]\n\n`);
                  } else {
                    try {
                      const data = JSON.parse(dataStr);
                      if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                        res.write(`data: ${JSON.stringify({ text: data.choices[0].delta.content })}\n\n`);
                      }
                    } catch (e) {
                      // ignore parse error for incomplete chunks
                    }
                  }
                }
              }
            }
          }
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
      } else if (provider === 'anthropic') {
        const url = 'https://api.anthropic.com/v1/messages';
        
        const anthropicMessages = messages.map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }));

        const body: any = {
          model: model,
          messages: anthropicMessages,
          max_tokens: maxTokens || 4096,
          stream: true
        };

        if (temperature !== undefined) body.temperature = temperature;
        if (systemInstruction) body.system = systemInstruction;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Anthropic API Error: ${response.status} ${err}`);
        }

        if (response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.trim() === '') continue;
              if (line.startsWith('data: ')) {
                const dataStr = line.substring(6);
                try {
                  const data = JSON.parse(dataStr);
                  if (data.type === 'content_block_delta' && data.delta && data.delta.text) {
                    res.write(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`);
                  }
                } catch (e) {
                  // ignore
                }
              }
            }
          }
        }
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error("Chat API Error:", error);
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
