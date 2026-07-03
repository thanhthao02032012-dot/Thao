import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, RefreshCw, Trash2, Copy, Download, Play, MessageSquare, Shield, AlertTriangle, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { AnalysisResult } from '../utils/fileAnalyzer';
import { useUI } from './UIProvider';
import { aiGateway } from '../lib/aiGateway';
import { db, auth } from '../firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  getDocs, 
  deleteDoc, 
  doc, 
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

interface AiAnalysisTabProps {
  file: File;
  analysisResult: AnalysisResult | null;
  pipelineContext: any;
  bookmarks?: any[];
  onAction: (action: string, payload: any) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  actions?: { action: string, payload: any }[];
}

export default function AiAnalysisTab({ file, analysisResult, pipelineContext, bookmarks, onAction }: AiAnalysisTabProps) {
  const { toast } = useUI();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);

  // Keep auth state stateful so the UI updates and re-loads when auth is initialized asynchronously
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  const fileId = `${file.name}-${file.size}`.replace(/[^a-zA-Z0-9]/g, '_');
  const chatCollectionPath = currentUser ? `users/${currentUser.uid}/files/${fileId}/chat_messages` : null;

  // Load chat history from Firestore or localStorage fallback
  useEffect(() => {
    const loadHistory = async () => {
      if (currentUser && chatCollectionPath) {
        // Authenticated user: load from Firestore
        try {
          const q = query(collection(db, chatCollectionPath), orderBy('timestamp', 'asc'));
          const querySnapshot = await getDocs(q);
          const history: ChatMessage[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            history.push({
              id: doc.id,
              role: data.role,
              text: data.text,
              actions: data.actions
            });
          });
          
          if (history.length > 0) {
            setMessages(history);
            hasSentInitialRef.current = true; // Don't trigger auto summary if there is history
          } else {
            setMessages([]);
          }
        } catch (err) {
          console.error("Error loading chat history from Firestore:", err);
        }
      } else {
        // Guest user: load from local storage
        try {
          const localKey = `webhexed_chat_history_${fileId}`;
          const savedHistory = localStorage.getItem(localKey);
          if (savedHistory) {
            const history = JSON.parse(savedHistory) as ChatMessage[];
            if (history.length > 0) {
              setMessages(history);
              hasSentInitialRef.current = true;
            } else {
              setMessages([]);
            }
          } else {
            setMessages([]);
          }
        } catch (err) {
          console.error("Error loading chat history from localStorage:", err);
        }
      }
    };

    loadHistory();
  }, [currentUser, fileId, chatCollectionPath]);

  const suggestedQuestions = [
    "🔍 Phân tích cấu trúc file này",
    "🎯 Mục đích của file này là gì?",
    "🛡️ Kiểm tra các dấu hiệu mã độc",
    "🔗 Tìm URL và API Key ẩn",
    "📦 Trích xuất tài nguyên (Media/Textures)",
    "🧩 Giải thích các Section lạ",
    "🧪 Đề xuất các bản vá tối ưu",
    "📊 Đánh giá độ rủi ro tổng thể"
  ];

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const hasSentInitialRef = useRef(false);

  // Generate initial summary if Deep Scan is ready and chat is empty
  useEffect(() => {
    if (pipelineContext && messages.length === 0 && !hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      // Auto-trigger the first summary
      sendMessage("Phân tích tổng quan file này dựa trên dữ liệu Deep Scan. Báo cáo chi tiết gồm: File Type, Mục đích, Dữ liệu nhạy cảm, Malware, Recommendations.");
    }
  }, [pipelineContext, messages.length]);

  const parseMessageAndActions = (text: string) => {
    // Look for ```json_action \n { ... } \n ```
    const actionRegex = /```json_action\s*([\s\S]*?)\s*```/g;
    let match;
    const actions: any[] = [];
    let cleanText = text;

    while ((match = actionRegex.exec(text)) !== null) {
      try {
        const actionData = JSON.parse(match[1]);
        if (Array.isArray(actionData)) {
          actions.push(...actionData);
        } else {
          actions.push(actionData);
        }
      } catch (e) {
        console.error("Failed to parse action JSON from AI", e);
      }
    }
    
    // Remove the action blocks from the display text
    cleanText = cleanText.replace(actionRegex, '').trim();

    return { cleanText, actions };
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    if (!analysisResult && !pipelineContext) {
      toast("Vui lòng đợi hệ thống phân tích (Deep Scan) hoàn tất trước khi sử dụng AI Chat.", "warning");
      return;
    }

    const newUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    const currentMessages = [...messages, newUserMsg];
    setMessages(currentMessages);
    setInput('');
    setIsLoading(true);

    // Save user message to Firestore or localStorage
    if (chatCollectionPath) {
      try {
        await addDoc(collection(db, chatCollectionPath), {
          role: 'user',
          text,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error("Error saving user message to Firestore:", err);
      }
    } else {
      try {
        const localKey = `webhexed_chat_history_${fileId}`;
        localStorage.setItem(localKey, JSON.stringify(currentMessages));
      } catch (err) {
        console.error("Error saving user message to localStorage:", err);
      }
    }

    try {
      // Reduce payload size to prevent huge network requests
      const cleanContext = JSON.parse(JSON.stringify(pipelineContext || analysisResult || { file: file.name, size: file.size }));
      
      // Inject bookmarks for context awareness
      cleanContext.workspace_bookmarks = bookmarks || [];

      // Trim known large arrays
      if (cleanContext.strings && Array.isArray(cleanContext.strings)) {
        cleanContext.strings = cleanContext.strings.slice(0, 100).concat([{ value: '...[TRUNCATED]' }]);
      }
      if (cleanContext.chunks && Array.isArray(cleanContext.chunks)) {
        cleanContext.chunks = cleanContext.chunks.slice(0, 50);
      }
      if (cleanContext.entropy && Array.isArray(cleanContext.entropy)) {
        delete cleanContext.entropy; // we don't need raw entropy arrays for AI chat
      }
      if (cleanContext['0'] && cleanContext['0'].result) {
         // Trim chunks inside pipeline results if needed
      }

      const data = await aiGateway({
          messages: currentMessages.map(m => ({ role: m.role, text: m.text })),
          scanContext: cleanContext,
          query: text,
          type: 'explain'
      });
      const { cleanText, actions } = parseMessageAndActions(data.reply);
      
      const newAiMsg: ChatMessage = { 
        id: (Date.now() + 1).toString(), 
        role: 'ai', 
        text: cleanText,
        actions: actions.length > 0 ? actions : undefined
      };
      
      setMessages(prev => [...prev, newAiMsg]);

      // Save AI response to Firestore or localStorage
      if (chatCollectionPath) {
        try {
          await addDoc(collection(db, chatCollectionPath), {
            role: 'ai',
            text: cleanText,
            actions: actions.length > 0 ? actions : undefined,
            timestamp: serverTimestamp()
          });
        } catch (err) {
          console.error("Error saving AI message to Firestore:", err);
        }
      } else {
        try {
          const localKey = `webhexed_chat_history_${fileId}`;
          localStorage.setItem(localKey, JSON.stringify([...currentMessages, newAiMsg]));
        } catch (err) {
          console.error("Error saving AI message to localStorage:", err);
        }
      }

    } catch (err: any) {
      if (err.message === 'AI Quota Exceeded' || err.status === 429) {
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', text: 'AI đang bận. Đang chuyển sang Local Deep Search...' }]);
          // TODO: Trigger Local Search
      } else {
          toast(`Lỗi AI Chat: ${err.message || 'Không thể kết nối API'}`, "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = (actionObj: any) => {
    if (onAction && actionObj.action && actionObj.payload) {
      if (actionObj.action === 'suggest_questions') return;

      if (actionObj.action === 'apply_patch') {
        const { offset, hexData, description } = actionObj.payload;
        if (confirm(`Áp dụng bản vá tại 0x${offset.toString(16).toUpperCase()}?\n\n"${description || 'Không có mô tả'}"`)) {
          executePatch(offset, hexData);
        }
        return;
      }
      
      if (actionObj.action === 'run_audio_engine') {
        const { engineId } = actionObj.payload;
        onAction('open_tab', { tabId: 'media' });
        toast(`Engine ${engineId.toUpperCase()} khởi động...`, "info");
        return;
      }
      
      onAction(actionObj.action, actionObj.payload);
      toast(`Đã chạy: ${actionObj.action}`, "success");
    }
  };

  const executePatch = (offset: number, hexData: string) => {
    const cleanHex = hexData.replace(/\s+/g, '');
    const patchList = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      patchList.push({
        offset: offset + (i / 2),
        value: parseInt(cleanHex.substring(i, i + 2), 16)
      });
    }
    onAction('apply_bulk_patches', patchList);
    toast("Đã áp dụng bản vá", "success");
  };

  const handleRunAll = (msgActions: any[]) => {
    const patches = msgActions.filter(a => a.action === 'apply_patch');
    if (patches.length === 0) return;

    if (confirm(`Bạn có muốn thực thi TẤT CẢ ${patches.length} bản vá do AI đề xuất không?`)) {
      const allPatches: any[] = [];
      patches.forEach(p => {
        const { offset, hexData } = p.payload;
        const cleanHex = hexData.replace(/\s+/g, '');
        for (let i = 0; i < cleanHex.length; i += 2) {
          allPatches.push({
            offset: offset + (i / 2),
            value: parseInt(cleanHex.substring(i, i + 2), 16)
          });
        }
      });
      onAction('apply_bulk_patches', allPatches);
      toast(`Đã thực thi thành công ${patches.length} bản vá!`, "success");
    }
  };

  const handleClear = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa lịch sử trò chuyện?')) {
      if (chatCollectionPath) {
        try {
          const q = query(collection(db, chatCollectionPath));
          const querySnapshot = await getDocs(q);
          const batch = writeBatch(db);
          querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          toast("Đã xóa lịch sử chat", "success");
        } catch (err) {
          console.error("Error clearing chat history from Firestore:", err);
          toast("Không thể xóa lịch sử trên server", "error");
        }
      } else {
        try {
          const localKey = `webhexed_chat_history_${fileId}`;
          localStorage.removeItem(localKey);
          toast("Đã xóa lịch sử chat", "success");
        } catch (err) {
          console.error("Error clearing chat history from localStorage:", err);
        }
      }
      setMessages([]);
      hasSentInitialRef.current = false;
    }
  };

  const handleExport = () => {
    const chatText = messages.map(m => `[${m.role.toUpperCase()}] ${m.text}`).join('\n\n');
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webhexed-ai-chat-${file.name}.txt`;
    a.click();
    toast("Đã xuất lịch sử chat", "success");
  };

  if (!pipelineContext && !analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0B0F14] text-[#94A3B8]">
        <Shield className="w-12 h-12 text-yellow-500 mb-4 opacity-50" />
        <h3 className="text-lg font-bold text-[#E8EAF0] mb-2">AI Analysis Offline</h3>
        <p className="text-xs max-w-md">
          Hệ thống AI Analysis cần dữ liệu từ <b>Deep Scan Pipeline</b> để hoạt động chính xác.
          Vui lòng chuyển qua tab <b>Deep Scan</b> và chạy tiến trình quét trước.
        </p>
        <button 
          onClick={() => onAction('open_tab', { tabId: 'scan_pipeline' })}
          className="mt-6 px-4 py-2 bg-[#3B82F6]/20 hover:bg-[#3B82F6]/30 text-[#3B82F6] rounded-lg text-xs font-bold transition-colors"
        >
          Mở Deep Scan Pipeline
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0B0F14]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#2A313C] flex items-center justify-between bg-[#11161D] shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-[#11161D] rounded-full"></div>
          </div>
          <div>
            <h2 className="text-xs font-bold text-[#E8EAF0] leading-none mb-0.5">Gemini AI Assistant</h2>
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-[#3B82F6]"></span>
              <span className="text-[9px] text-[#94A3B8] font-medium tracking-tight uppercase">WebHexed Binary Expert</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleExport} className="p-1.5 hover:bg-[#2A313C] rounded text-[#94A3B8] transition-colors" title="Export Chat">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleClear} className="p-1.5 hover:bg-[#2A313C] rounded text-[#94A3B8] hover:text-red-400 transition-colors" title="Clear Chat">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chat History */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {messages.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center h-full text-center text-[#94A3B8] space-y-6 max-w-lg mx-auto"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600/20 to-blue-600/20 flex items-center justify-center border border-purple-500/20">
                  <Bot className="w-8 h-8 text-[#3B82F6]" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#3B82F6] rounded-full border-2 border-[#0B0F14] flex items-center justify-center">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[#E8EAF0]">Sẵn sàng Phân tích Nhị phân</h3>
                <p className="text-[11px] leading-relaxed opacity-70">
                  Tôi đã đọc dữ liệu từ Scan Context. Bạn muốn tìm kiếm điều gì trong file <b>{file.name}</b>?
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                {suggestedQuestions.map((q, idx) => (
                  <motion.button 
                    key={idx}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => sendMessage(q.replace(/^[^\s]+\s/, ''))}
                    className="px-3 py-2.5 bg-[#171C23] hover:bg-[#202833] border border-[#2A313C] hover:border-blue-500/30 rounded-xl text-[10px] text-left text-[#E8EAF0] transition-all group flex items-center gap-2"
                  >
                    <span className="text-sm group-hover:scale-110 transition-transform">{q.split(' ')[0]}</span>
                    <span className="opacity-70 group-hover:opacity-100">{q.split(' ').slice(1).join(' ')}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((m, mIdx) => (
              <motion.div 
                key={m.id} 
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                layout
                className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${m.role === 'user' ? 'bg-[#3B82F6] text-white' : 'bg-gradient-to-tr from-purple-600 to-blue-600 text-white'}`}>
                  {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-[#3B82F6] text-white rounded-tr-none' : 'bg-[#171C23] border border-[#2A313C] text-[#E8EAF0] rounded-tl-none'}`}>
                  {m.role === 'ai' ? (
                    <div className="relative group">
                      <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-blue-400">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                      
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(m.text);
                          toast("Đã sao chép vào bộ nhớ tạm", "success");
                        }}
                        className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 hover:bg-[#2A313C] rounded transition-all text-[#94A3B8]"
                        title="Copy message"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      
                      {/* Render Actions and Sequential Suggestions */}
                      {m.actions && m.actions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[#2A313C] flex flex-col gap-4">
                          {/* Batch Action Header */}
                          {m.actions.filter(a => a.action === 'apply_patch').length > 1 && (
                            <button
                              onClick={() => handleRunAll(m.actions!)}
                              className="w-full py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-400 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-500/5"
                            >
                              <Play className="w-4 h-4 fill-current" />
                              Thực thi tất cả các bản vá ({m.actions.filter(a => a.action === 'apply_patch').length})
                            </button>
                          )}

                          {/* Main Actions */}
                          <div className="flex flex-wrap gap-2">
                            {m.actions.filter(a => a.action !== 'suggest_questions').map((act, i) => (
                              <button
                                key={i}
                                onClick={() => handleActionClick(act)}
                                className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-[10px] font-bold rounded-lg flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                              >
                                {act.action === 'open_tab' ? <ExternalLink className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                                {act.action === 'apply_patch' ? `Vá: 0x${act.payload.offset.toString(16).toUpperCase()}` : `Chạy: ${act.action}`}
                              </button>
                            ))}
                          </div>

                          {/* Sequential Suggestions / Quick Replies */}
                          {mIdx === messages.length - 1 && m.actions.find(a => a.action === 'suggest_questions') && (
                            <div className="flex flex-col gap-2">
                              <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3 text-blue-400" />
                                Gợi ý tiếp theo
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {m.actions.find(a => a.action === 'suggest_questions')?.payload?.questions?.map((q: string, i: number) => (
                                  <button
                                    key={i}
                                    onClick={() => sendMessage(q)}
                                    className="px-4 py-2 bg-[#1E2530] hover:bg-[#3B82F6]/20 border border-[#2A313C] hover:border-blue-500/50 text-[#E8EAF0] hover:text-blue-400 text-[11px] font-medium rounded-xl transition-all shadow-sm"
                                  >
                                    {q}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="relative group">
                      <div className="whitespace-pre-wrap">{m.text}</div>
                      <button 
                        onClick={() => navigator.clipboard.writeText(m.text)}
                        className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all text-white/70"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#171C23] border border-[#2A313C] rounded-2xl rounded-tl-none p-4 flex items-center gap-1.5 shadow-sm">
              <div className="w-1.5 h-1.5 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-[#3B82F6] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-[#3B82F6] rounded-full animate-bounce"></div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[#2A313C] bg-[#11161D]">
        <div className="relative max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Đặt câu hỏi về file này..."
            disabled={isLoading}
            className="w-full bg-[#171C23] border border-[#2A313C] focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 rounded-2xl pl-4 pr-12 py-3 text-xs text-[#E8EAF0] placeholder-[#4B5563] resize-none min-h-[48px] max-h-32 transition-all scrollbar-hide"
            rows={1}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className="absolute right-2 bottom-2 p-2 bg-[#3B82F6] hover:bg-blue-600 disabled:bg-[#1E2530] disabled:text-[#4B5563] text-white rounded-xl transition-all shadow-lg shadow-blue-500/10 active:scale-95"
          >
            {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <div className="mt-2 text-center">
          <p className="text-[9px] text-[#4B5563] font-medium tracking-wide uppercase">
            Powered by WebHexed AI Engine • Gemini 3.1 Flash Lite
          </p>
        </div>
      </div>
    </div>
  );
};
