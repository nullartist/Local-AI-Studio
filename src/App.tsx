import { useState, useEffect, useRef } from 'react';
import { Send, Settings, Trash2, Bot, User, X, Code2, Play, Copy, Check, Sparkles, Folder, File, RefreshCw, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from './lib/utils';

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type Provider = 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'custom';

type Settings = {
  provider: Provider;
  model: string;
  apiKey: string;
  baseUrl: string;
  systemInstruction: string;
  temperature: number;
  topP: number;
  maxTokens: number;
};

const SYSTEM_PROMPT_TEMPLATE = `You are an autonomous AI developer. You have access to the local file system to create, read, edit, and delete files, as well as run git commands for version control.

Always maintain a \`.ainotes/\` directory.
- \`.ainotes/status.md\`: Current status of the project, what is working, what is broken.
- \`.ainotes/plan.md\`: The step-by-step plan for the current feature.

To interact with the system, you MUST use the following XML tool calling format. You can only call ONE tool per response. After you call a tool, the system will provide the result as a system message, and you can continue.

<call_tool name="list_files">
{"dir": "."}
</call_tool>

<call_tool name="read_file">
{"path": "src/App.tsx", "start_line": 1, "end_line": 50}
</call_tool>

<call_tool name="write_file">
{"path": "src/components/New.tsx", "content": "export default function New() { return <div/>; }"}
</call_tool>

<call_tool name="edit_file">
{"path": "src/App.tsx", "start_line": 10, "end_line": 12, "replacement": "  const [state, setState] = useState(0);"}
</call_tool>

<call_tool name="delete_file">
{"path": "src/old.ts"}
</call_tool>

<call_tool name="search_files">
{"query": "useState", "dir": "src"}
</call_tool>

<call_tool name="git">
{"command": "status"}
</call_tool>

Best Practices:
1. Always read files before editing them.
2. Use edit_file with precise start_line and end_line to replace specific blocks of code instead of rewriting the whole file.
3. Keep your .ainotes updated.
4. Use git to commit changes after a successful milestone: <call_tool name="git">{"command": "commit -am 'feat: added x'"}</call_tool>
5. If you are done with a task, just reply normally without calling a tool.`;

const PREDEFINED_INSTRUCTIONS: Record<Provider, string> = {
  gemini: SYSTEM_PROMPT_TEMPLATE,
  openai: SYSTEM_PROMPT_TEMPLATE,
  anthropic: SYSTEM_PROMPT_TEMPLATE,
  ollama: SYSTEM_PROMPT_TEMPLATE,
  custom: SYSTEM_PROMPT_TEMPLATE
};

const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-preview',
  apiKey: '',
  baseUrl: '',
  systemInstruction: PREDEFINED_INSTRUCTIONS.gemini,
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 8192,
};

const PROVIDERS: { id: Provider; name: string; defaultModel: string; requiresBaseUrl?: boolean }[] = [
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-3.1-flash-preview' },
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-3-7-sonnet-20250219' },
  { id: 'ollama', name: 'Ollama (Local)', defaultModel: 'llama3', requiresBaseUrl: true },
  { id: 'custom', name: 'Custom (OpenAI Compatible)', defaultModel: '', requiresBaseUrl: true },
];

const Workspace = () => {
  const [files, setFiles] = useState<any[]>([]);
  const [gitStatus, setGitStatus] = useState('');
  const [aiNotes, setAiNotes] = useState<{ status: string; plan: string }>({ status: '', plan: '' });

  const fetchWorkspace = async () => {
    try {
      const res = await fetch('/api/fs/list', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ dir: '.' }) });
      const data = await res.json();
      setFiles(data.files || []);
      
      const gitRes = await fetch('/api/git', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ command: 'status -s' }) });
      const gitData = await gitRes.json();
      setGitStatus(gitData.stdout || 'Clean working tree');

      // Fetch .ainotes
      const statusRes = await fetch('/api/fs/read', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: '.ainotes/status.md' }) });
      const statusData = await statusRes.json();
      
      const planRes = await fetch('/api/fs/read', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ path: '.ainotes/plan.md' }) });
      const planData = await planRes.json();

      setAiNotes({
        status: statusData.content ? statusData.content.replace(/^\\d+: /gm, '') : 'No status.md found',
        plan: planData.content ? planData.content.replace(/^\\d+: /gm, '') : 'No plan.md found'
      });
    } catch(e) {}
  };

  useEffect(() => { fetchWorkspace(); }, []);

  return (
    <div className="p-4 text-sm text-gray-300 h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2"><Folder size={16} /> Workspace</h3>
        <button onClick={fetchWorkspace} className="p-1 hover:bg-gray-800 rounded transition-colors" title="Refresh Workspace">
          <RefreshCw size={14}/>
        </button>
      </div>

      <div className="mb-6">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Bot size={14}/> AI Notes</h4>
        <div className="space-y-4">
          <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <h5 className="text-xs font-semibold text-blue-400 mb-2">status.md</h5>
            <div className="prose prose-sm prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiNotes.status}</ReactMarkdown>
            </div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
            <h5 className="text-xs font-semibold text-purple-400 mb-2">plan.md</h5>
            <div className="prose prose-sm prose-invert max-w-none text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiNotes.plan}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><Terminal size={14}/> Git Status</h4>
        <pre className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs font-mono overflow-x-auto">
          {gitStatus || 'No changes'}
        </pre>
      </div>
      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Files</h4>
        <ul className="space-y-1">
          {files.map(f => (
            <li key={f.name} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded cursor-default">
              {f.isDirectory ? <Folder size={14} className="text-blue-400"/> : <File size={14} className="text-gray-400"/>}
              {f.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const GitPanel = () => {
  const [gitStatus, setGitStatus] = useState('');
  const [gitLog, setGitLog] = useState('');
  const [gitDiff, setGitDiff] = useState('');

  const fetchGitData = async () => {
    try {
      const statusRes = await fetch('/api/git', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ command: 'status' }) });
      const statusData = await statusRes.json();
      setGitStatus(statusData.stdout || statusData.stderr || 'No status available');

      const logRes = await fetch('/api/git', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ command: 'log -n 5 --oneline' }) });
      const logData = await logRes.json();
      setGitLog(logData.stdout || 'No commits yet');

      const diffRes = await fetch('/api/git', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ command: 'diff' }) });
      const diffData = await diffRes.json();
      setGitDiff(diffData.stdout || 'No unstaged changes');
    } catch(e) {}
  };

  useEffect(() => { fetchGitData(); }, []);

  return (
    <div className="p-4 text-sm text-gray-300 h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-700 space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-white flex items-center gap-2"><Terminal size={16} /> Git Version Control</h3>
        <button onClick={fetchGitData} className="p-1 hover:bg-gray-800 rounded transition-colors" title="Refresh Git Data">
          <RefreshCw size={14}/>
        </button>
      </div>

      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Status</h4>
        <pre className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs font-mono overflow-x-auto text-blue-400">
          {gitStatus}
        </pre>
      </div>

      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Recent Commits</h4>
        <pre className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs font-mono overflow-x-auto text-green-400">
          {gitLog}
        </pre>
      </div>

      <div>
        <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Unstaged Changes (Diff)</h4>
        <pre className="bg-gray-900 p-3 rounded-lg border border-gray-800 text-xs font-mono overflow-x-auto text-orange-400">
          {gitDiff}
        </pre>
      </div>
    </div>
  );
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('ai-studio-settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'workspace' | 'git'>('code');
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('ai-studio-settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleProviderChange = (newProvider: Provider) => {
    const defaultModel = PROVIDERS.find(p => p.id === newProvider)?.defaultModel || '';
    setSettings(prev => ({
      ...prev,
      provider: newProvider,
      model: defaultModel,
    }));
  };

  const processChat = async (currentMessages: Message[]) => {
    setIsGenerating(true);
    const assistantMsgId = (Date.now() + 1).toString();
    
    setMessages(prev => {
      if (prev[prev.length - 1]?.id === assistantMsgId) return prev;
      return [...prev, { id: assistantMsgId, role: 'assistant', content: '' }];
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          messages: currentMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) throw new Error('Network response was not ok');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantContent = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              if (dataStr === '[DONE]') {
                done = true;
                break;
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.error) {
                  assistantContent += `\n\n**Error:** ${data.error}`;
                  done = true;
                  break;
                }
                if (data.text) {
                  assistantContent += data.text;
                  setMessages(prev => 
                    prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantContent } : m)
                  );
                }
              } catch (e) {
                // ignore parse error
              }
            }
          }
        }
      }

      // Check for tool call
      const match = assistantContent.match(/<call_tool\s+name="([^"]+)">([\s\S]*?)<\/call_tool>/);
      if (match) {
        const toolName = match[1];
        const toolArgsStr = match[2];
        let toolArgs = {};
        try { toolArgs = JSON.parse(toolArgsStr); } catch(e) {}
        
        let resultStr = "";
        try {
           let endpoint = "";
           if (toolName === 'list_files') endpoint = '/api/fs/list';
           else if (toolName === 'read_file') endpoint = '/api/fs/read';
           else if (toolName === 'write_file') endpoint = '/api/fs/write';
           else if (toolName === 'edit_file') endpoint = '/api/fs/edit';
           else if (toolName === 'delete_file') endpoint = '/api/fs/delete';
           else if (toolName === 'search_files') endpoint = '/api/fs/search';
           else if (toolName === 'git') endpoint = '/api/git';

           if (endpoint) {
             const res = await fetch(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(toolArgs) });
             const data = await res.json();
             resultStr = JSON.stringify(data, null, 2);
           } else {
             resultStr = "Error: Unknown tool";
           }
        } catch (e: any) {
           resultStr = `Error executing tool: ${e.message}`;
        }

        const systemMsg: Message = { id: Date.now().toString(), role: 'system', content: `Tool ${toolName} result:\n` + "```json\n" + resultStr + "\n```" };
        const newMessages = [...currentMessages, { id: assistantMsgId, role: 'assistant', content: assistantContent }, systemMsg];
        setMessages(newMessages);
        
        // Trigger next turn automatically
        setTimeout(() => processChat(newMessages), 500);
      } else {
        setIsGenerating(false);
      }
    } catch (error: any) {
      setMessages(prev => 
        prev.map(m => m.id === assistantMsgId ? { ...m, content: `**Error:** ${error.message}` } : m)
      );
      setIsGenerating(false);
    }
  };

  const handleSend = () => {
    if (!input.trim() || isGenerating) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    processChat(newMessages);
  };

  const clearChat = () => {
    if (confirm('Are you sure you want to clear the chat?')) {
      setMessages([]);
    }
  };

  const extractLatestCode = () => {
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return { code: '', lang: '' };
    
    const lastMessage = assistantMessages[assistantMessages.length - 1].content;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    let match;
    let lastCode = '';
    let lastLang = '';
    
    while ((match = codeBlockRegex.exec(lastMessage)) !== null) {
      lastLang = match[1] || 'text';
      lastCode = match[2];
    }
    
    return { code: lastCode, lang: lastLang };
  };

  const { code: latestCode, lang: latestLang } = extractLatestCode();

  const handleCopyCode = () => {
    if (latestCode) {
      navigator.clipboard.writeText(latestCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#1e1e1e] text-gray-100 font-sans overflow-hidden">
      
      {/* Left Panel: Chat Interface */}
      <div className="w-full md:w-[450px] flex flex-col border-r border-gray-800 bg-[#1e1e1e] shrink-0 z-10">
        {/* Header */}
        <header className="h-14 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
              <Sparkles size={18} />
            </div>
            <h1 className="font-semibold text-sm tracking-wide">Build AI Studio</h1>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={clearChat}
              className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-md transition-colors"
              title="Clear Chat"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              title="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-700">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
              <Bot size={48} className="opacity-20" />
              <p className="text-sm text-center px-4">Describe the app you want to build, and the AI will generate the code.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "")}>
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
                  msg.role === 'user' ? "bg-blue-600 text-white" : msg.role === 'system' ? "bg-purple-900/50 text-purple-400 border border-purple-800/50" : "bg-gray-800 text-blue-400 border border-gray-700"
                )}>
                  {msg.role === 'user' ? <User size={14} /> : msg.role === 'system' ? <Terminal size={14} /> : <Bot size={14} />}
                </div>
                <div className={cn(
                  "px-4 py-3 rounded-2xl max-w-[85%] text-sm",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-sm" 
                    : msg.role === 'system'
                    ? "bg-purple-900/20 text-purple-200 rounded-tl-sm border border-purple-800/30 font-mono text-xs"
                    : "bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700"
                )}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <div className="markdown-body prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content || '...'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-[#1e1e1e] border-t border-gray-800 shrink-0">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="What do you want to build?"
              className="w-full pl-4 pr-12 py-3 bg-gray-900 border border-gray-700 text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[56px] max-h-32 text-sm placeholder-gray-500"
              rows={1}
              disabled={isGenerating}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isGenerating}
              className="absolute right-2 bottom-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <div className="text-center mt-2 text-[10px] text-gray-500 uppercase tracking-wider">
            {settings.provider} • {settings.model}
          </div>
        </div>
      </div>

      {/* Right Panel: Code / Workspace */}
      <div className="hidden md:flex flex-1 flex-col bg-[#0d0d0d] relative">
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-4 bg-[#1e1e1e]">
          <div className="flex space-x-1">
            <button 
              onClick={() => setActiveTab('code')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                activeTab === 'code' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              )}
            >
              <Code2 size={16} /> Code
            </button>
            <button 
              onClick={() => setActiveTab('workspace')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                activeTab === 'workspace' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              )}
            >
              <Folder size={16} /> Workspace
            </button>
            <button 
              onClick={() => setActiveTab('git')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                activeTab === 'git' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              )}
            >
              <Terminal size={16} /> Git
            </button>
          </div>
          
          {activeTab === 'code' && latestCode && (
            <button 
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md transition-colors border border-gray-700"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy Code'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto relative">
          {activeTab === 'code' ? (
            latestCode ? (
              <SyntaxHighlighter
                language={latestLang || 'tsx'}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '1.5rem',
                  background: 'transparent',
                  fontSize: '14px',
                  lineHeight: '1.5',
                }}
                wrapLines={true}
              >
                {latestCode}
              </SyntaxHighlighter>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-4">
                <Code2 size={48} className="opacity-20" />
                <p>No code generated yet. Ask the AI to build something!</p>
              </div>
            )
          ) : activeTab === 'workspace' ? (
            <Workspace />
          ) : (
            <GitPanel />
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Settings size={18} /> Run Settings
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Provider & Model */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Provider</label>
                    <select
                      value={settings.provider}
                      onChange={(e) => handleProviderChange(e.target.value as Provider)}
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Model</label>
                    <input
                      type="text"
                      value={settings.model}
                      onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                      placeholder="e.g. gpt-4o, gemini-3.1-flash-preview"
                      className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* API Key */}
                  {settings.provider !== 'ollama' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        API Key {settings.provider === 'gemini' && '(Optional if in env)'}
                      </label>
                      <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                        placeholder="sk-..."
                        className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  )}

                  {/* Base URL */}
                  {PROVIDERS.find(p => p.id === settings.provider)?.requiresBaseUrl && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Base URL</label>
                      <input
                        type="text"
                        value={settings.baseUrl}
                        onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                        placeholder={settings.provider === 'ollama' ? "http://localhost:11434" : "https://api.openai.com/v1/chat/completions"}
                        className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  )}
                  
                  {/* Parameters */}
                  <div className="space-y-5 pt-4 border-t border-gray-800">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Temperature</label>
                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{settings.temperature}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={settings.temperature}
                        onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Top P</label>
                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{settings.topP}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={settings.topP}
                        onChange={(e) => setSettings({ ...settings, topP: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Max Tokens</label>
                        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">{settings.maxTokens}</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="128000"
                        value={settings.maxTokens}
                        onChange={(e) => setSettings({ ...settings, maxTokens: parseInt(e.target.value) || 4096 })}
                        className="w-full p-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: System Instructions */}
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">System Instructions</label>
                    <select 
                      className="bg-transparent text-xs text-blue-400 hover:text-blue-300 outline-none cursor-pointer"
                      onChange={(e) => {
                        if (e.target.value) {
                          setSettings({ ...settings, systemInstruction: PREDEFINED_INSTRUCTIONS[e.target.value as Provider] });
                        }
                      }}
                      value=""
                    >
                      <option value="" disabled>Load Preset...</option>
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.name} Default</option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={settings.systemInstruction}
                    onChange={(e) => setSettings({ ...settings, systemInstruction: e.target.value })}
                    className="flex-1 w-full p-3 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[300px] resize-none font-mono text-xs leading-relaxed"
                    placeholder="You are a helpful assistant..."
                  />
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-800 bg-[#1e1e1e] rounded-b-xl">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
