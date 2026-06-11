/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Send, Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { aiService } from '../../services/aiService';

export const DoubtSolver = () => {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hello! I'm Lumina, your AI study coach. I've analyzed your learning style and recent progress. How can I help you master your current topics today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const send = async () => {
    if (!input || isTyping) return;
    
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await aiService.generateSummary(`User is asking a doubt: "${input}". Please respond as Lumina, an encouraging AI study coach. History: ${JSON.stringify(messages)}`);
      
      setMessages(prev => [...prev, { role: 'assistant', text: response.summary }]);
    } catch (err: any) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto h-[85vh] flex flex-col bg-[#F3F5FF] rounded-[40px] overflow-hidden shadow-2xl relative border border-white/50">
      {/* Brain Background Decoration */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/4 opacity-10 pointer-events-none">
        <Brain size={400} className="text-indigo-600" />
      </div>

      <div className="p-10 flex justify-between items-start relative z-10">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 bg-indigo-600 rounded-[20px] flex items-center justify-center shadow-lg shadow-indigo-200">
            <Sparkles size={32} className="text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-indigo-950 tracking-tight">Lumina Chat</h2>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em] mt-1">AI Personality Guide</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-[#E1FFEB] text-[#22C55E] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#BFFFD1]">
          Online
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 space-y-8 relative z-10 custom-scrollbar pb-10">
        <div className="h-4" /> {/* Spacer */}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-6 rounded-[32px] text-lg font-medium leading-relaxed shadow-sm ${
              m.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white text-indigo-900 border border-indigo-100 rounded-tl-none'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
             <div className="bg-white text-indigo-900 p-6 rounded-[32px] rounded-tl-none border border-indigo-100 flex gap-2">
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
             </div>
          </div>
        )}
        <div className="h-4" /> {/* Spacer */}
      </div>

      <div className="p-10 pt-4 relative z-10">
        <div className="group relative bg-white rounded-[24px] p-2 border-2 border-indigo-100 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-100 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-center gap-4">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && send()}
              placeholder="Ask Lumina about your personality, weaknesses, or next steps..."
              className="flex-1 pl-6 py-4 bg-transparent border-none text-indigo-950 placeholder:text-on-surface-variant/40 font-medium focus:outline-none text-base"
            />
            <button onClick={send} className="w-14 h-14 bg-indigo-600 text-white rounded-[16px] flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">
              <Send size={24} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
