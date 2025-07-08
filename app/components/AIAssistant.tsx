// app/components/AIAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useFetcher } from '@remix-run/react';
import { INTENT } from '~/utils/intents';

interface AIMessage {
  sender: 'User' | 'AI';
  text: string;
}

interface AIAssistantProps {
  shopName?: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ shopName = "Planet Beauty" }) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    { 
      sender: "AI", 
      text: "Welcome to Planet Beauty Inventory AI! Ask about inventory levels, sales trends, or restocking recommendations for products like Anastasia Brow Gel or Elta MD Sunscreen." 
    }
  ]);
  const [input, setInput] = useState("");
  const fetcher = useFetcher();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMessages = [...messages, { sender: "User" as const, text: input }];
    setMessages(newMessages);

    // Generate Planet Beauty specific AI responses
    let response = "";
    const inputLower = input.toLowerCase();
    
    if (inputLower.includes("inventory") || inputLower.includes("stock")) {
      response = "Current inventory levels: Anastasia Brow Gel (50 units), Elta MD Sunscreen (10 units - LOW), Borghese Serum (20 units), Kerastase Shampoo (30 units), Mario Badescu Spray (15 units - LOW), T3 Hair Dryer (5 units - CRITICAL).";
    } else if (inputLower.includes("sales") || inputLower.includes("trend") || inputLower.includes("velocity")) {
      response = "High sales trends detected: Elta MD Sunscreen (40 units/day, 160% increase), Mario Badescu Spray (50 units/day, 111% increase), T3 Hair Dryer (35 units/day, 438% increase). Consider restocking to avoid stockouts.";
    } else if (inputLower.includes("restock") || inputLower.includes("order")) {
      response = "Restocking recommendations: Elta MD Sunscreen (reorder 200 units, lead time 5 days), Mario Badescu Spray (reorder 250 units, lead time 3 days), T3 Hair Dryer (reorder 175 units, lead time 7 days).";
    } else if (inputLower.includes("alert") || inputLower.includes("notification")) {
      response = "Critical alerts: T3 Hair Dryer (5 units left, estimated stockout in 0.14 days), Mario Badescu Spray (15 units left, stockout in 0.3 days). High sales velocity alerts for trending products detected.";
    } else if (inputLower.includes("anastasia") || inputLower.includes("brow")) {
      response = "Anastasia Beverly Hills Clear Brow Gel: 50 units in stock, $23.00, trending product with 15 units/day sales velocity. Healthy stock level, estimated 3.33 days until restock needed.";
    } else if (inputLower.includes("elta") || inputLower.includes("sunscreen")) {
      response = "Elta MD UV Physical SPF40: 10 units in stock (LOW), $39.00, high sales velocity at 40 units/day. URGENT: Estimated stockout in 0.25 days. Recommend immediate reorder of 200 units.";
    } else if (inputLower.includes("mario") || inputLower.includes("badescu")) {
      response = "Mario Badescu Facial Spray: 15 units in stock (LOW), $12.00, trending with 50 units/day velocity. Estimated stockout in 0.3 days. Popular item - recommend reordering 250 units immediately.";
    } else if (inputLower.includes("t3") || inputLower.includes("hair dryer")) {
      response = "T3 Featherweight Hair Dryer: 5 units in stock (CRITICAL), $199.99, high sales velocity at 35 units/day. URGENT: Stockout expected in 0.14 days. Immediate restock of 175 units recommended.";
    } else if (inputLower.includes("revenue") || inputLower.includes("profit")) {
      response = "Top revenue drivers: T3 Hair Dryer ($999.95 total), Borghese Serum ($1,580), Elta MD Sunscreen ($975). Focus restocking efforts on high-value trending items for maximum profit impact.";
    } else {
      response = "I can help with Planet Beauty inventory levels, sales trends, or restocking recommendations. Try asking about specific products like Anastasia Brow Gel, Elta MD Sunscreen, or our trending items!";
    }
    
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: "AI", text: response }]);
    }, 500);
    
    setInput("");
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="pb-card pb-mb-6">
      <div className="pb-flex pb-justify-between pb-items-center pb-mb-4">
        <h2 className="pb-text-lg pb-font-medium">AI Assistant</h2>
        <div className="pb-text-sm" style={{ color: '#718096' }}>
          Ask about inventory levels, sales trends, or get restocking recommendations
        </div>
      </div>
      
      {/* Chat Container */}
      <div 
        ref={chatScrollRef}
        className="bg-gray-50 pb-p-4 rounded-md pb-mb-4 max-h-60 pb-overflow-y-auto"
      >
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`pb-mb-3 ${msg.sender === 'AI' ? 'text-gray-700' : 'text-blue-600'}`}
          >
            <div className={`inline-block max-w-xs lg:max-w-md px-3 py-2 rounded-lg ${
              msg.sender === 'AI' 
                ? 'bg-white shadow-sm border' 
                : 'bg-blue-500 text-white ml-auto'
            }`}>
              <strong className={msg.sender === 'AI' ? 'text-pink-600' : 'text-white'}>
                {msg.sender === 'AI' ? '🤖 Planet Beauty AI' : 'You'}: 
              </strong>
              <span className="ml-1">{msg.text}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Input Section */}
      <div className="pb-flex">
        <input
          type="text"
          className="pb-input pb-flex-1 mr-2"
          placeholder="Ask about Planet Beauty inventory..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          style={{ 
            borderColor: '#d81b60',
            boxShadow: input ? '0 0 0 3px rgba(216, 27, 96, 0.1)' : 'none'
          }}
        />
        <button 
          className="pb-btn-primary px-4" 
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            backgroundColor: '#d81b60',
            opacity: !input.trim() ? 0.6 : 1
          }}
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>

      {/* Quick Suggestions */}
      <div className="pb-mt-3">
        <div className="pb-text-sm pb-mb-2" style={{ color: '#718096' }}>Quick questions:</div>
        <div className="pb-flex pb-flex-wrap pb-space-x-2">
          {[
            "What's the inventory status?",
            "Show me trending products",
            "Which items need restocking?",
            "Check Elta MD sunscreen"
          ].map((suggestion, index) => (
            <button
              key={index}
              className="pb-btn-secondary pb-text-sm pb-mb-2"
              onClick={() => setInput(suggestion)}
              style={{ fontSize: '12px', padding: '4px 8px' }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
