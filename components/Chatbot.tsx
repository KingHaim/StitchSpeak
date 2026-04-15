
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { PRICING } from '../constants';
import { formatPrice } from '../services/pricingService';
import { SendIcon } from './icons/SendIcon';

interface ChatbotProps {
  history: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  error: string | null;
  messageCount: number;
  maxMessages: number;
  onUnlockChat: () => void;
}

export const Chatbot: React.FC<ChatbotProps> = ({ history, onSendMessage, isLoading, error, messageCount, maxMessages, onUnlockChat }) => {
  const [input, setInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { packageSize, packagePrice } = PRICING.chat;
  const isLocked = messageCount >= maxMessages;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && !isLocked) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-brand-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-brand-800">Ask a question about the pattern</h2>
        <span className="text-xs text-brand-400">
          {messageCount}/{maxMessages} messages
        </span>
      </div>
      <div className="h-80 bg-brand-50 rounded-lg p-4 flex flex-col border border-brand-200">
        <div className="flex-grow overflow-y-auto mb-4 space-y-4">
          {history.map((msg, index) => (
            <div key={index} className={`flex ${msg.author === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl ${msg.author === 'user' ? 'bg-brand-600 text-white' : 'bg-brand-200 text-brand-800'}`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               <div className="max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl bg-brand-200 text-brand-800">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 bg-brand-500 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          )}
          {error && (
             <div className="flex justify-start">
               <div className="max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl bg-red-100 text-red-700">
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {isLocked ? (
          <div className="pt-4 border-t border-brand-200 text-center">
            <p className="text-sm text-brand-400 mb-2">
              You've used all your messages.
            </p>
            <button
              onClick={onUnlockChat}
              className="px-6 py-2 bg-brand-600 text-white text-sm font-bold rounded-lg hover:bg-brand-700 transition"
            >
              Unlock {packageSize} messages for {formatPrice(packagePrice)}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-4 border-t border-brand-200">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for clarification, definitions, etc..."
              disabled={isLoading}
              className="w-full px-4 py-2 bg-white border border-brand-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-opacity-50 transition disabled:bg-brand-300 disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <SendIcon className="w-6 h-6"/>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
