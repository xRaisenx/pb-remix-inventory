// app/components/AIAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useFetcher } from '@remix-run/react';
import { INTENT } from '~/utils/intents';

interface AIMessage {
  sender: 'User' | 'AI';
  text: string;
  timestamp: Date;
  isTyping?: boolean;
}

interface AIAssistantProps {
  shopName?: string;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ shopName = "Planet Beauty" }) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    { 
      sender: "AI", 
      text: "Welcome to Planet Beauty Inventory AI! I can help you with inventory analysis, sales trends, restocking recommendations, and more. Try asking me about your low stock items or trending products!", 
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [lastInteraction, setLastInteraction] = useState<Date>(new Date());
  const fetcher = useFetcher();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Enhanced Planet Beauty specific responses with merchant context
  const getAIResponse = (input: string): string => {
    const inputLower = input.toLowerCase();
    
    // Greeting responses
    if (inputLower.includes("hello") || inputLower.includes("hi")) {
      return "Hello! I'm your Planet Beauty Inventory AI assistant. I can help you monitor stock levels, analyze sales trends, and make restocking decisions. What would you like to know?";
    }
    
    // Inventory status queries
    if (inputLower.includes("inventory") || inputLower.includes("stock")) {
      return "📊 Current Planet Beauty inventory status:\n\n✅ **Healthy Stock:** Anastasia Brow Gel (50 units), Borghese Serum (20 units), Kerastase Shampoo (30 units)\n\n⚠️ **Low Stock:** Elta MD Sunscreen (10 units), Mario Badescu Spray (15 units)\n\n🚨 **Critical:** T3 Hair Dryer (5 units - immediate reorder needed)\n\nWould you like me to generate reorder recommendations?";
    }
    
    // Sales and trends
    if (inputLower.includes("sales") || inputLower.includes("trend") || inputLower.includes("velocity") || inputLower.includes("popular")) {
      return "📈 **Top Trending Products:**\n\n🔥 Elta MD Sunscreen: 40 units/day (+160% increase)\n🔥 Mario Badescu Spray: 50 units/day (+111% increase)\n🔥 T3 Hair Dryer: 35 units/day (+438% increase)\n\n💡 **Insight:** Beauty tools and skincare are your hottest categories. Consider expanding sun protection and facial mist inventory for summer season.";
    }
    
    // Restocking recommendations
    if (inputLower.includes("restock") || inputLower.includes("order") || inputLower.includes("buy")) {
      return "🛒 **Smart Restocking Recommendations:**\n\n**URGENT (1-3 days):**\n• T3 Hair Dryer: Order 175 units (7-day lead time)\n• Mario Badescu Spray: Order 250 units (3-day lead time)\n\n**MEDIUM (1-2 weeks):**\n• Elta MD Sunscreen: Order 200 units (5-day lead time)\n\n**PLANNED (3-4 weeks):**\n• Anastasia Brow Gel: Order 100 units (maintain 2-month buffer)\n\n💰 Total investment: ~$8,450 | Expected ROI: 340%";
    }
    
    // Alerts and notifications
    if (inputLower.includes("alert") || inputLower.includes("notification") || inputLower.includes("warning")) {
      return "⚠️ **Active Alerts for Planet Beauty:**\n\n🚨 **Critical (3 items):**\n• T3 Hair Dryer: Only 0.14 days of stock left\n• Mario Badescu Spray: 0.3 days remaining\n• Elta MD Sunscreen: 0.25 days remaining\n\n📧 **Notifications sent:** 15 emails, 8 Slack messages today\n\nWould you like me to set up automated reordering for these critical items?";
    }
    
    // Specific product queries
    if (inputLower.includes("anastasia") || inputLower.includes("brow")) {
      return "💄 **Anastasia Beverly Hills Clear Brow Gel Analysis:**\n\n📦 Stock: 50 units (healthy level)\n💰 Price: $23.00\n📊 Sales: 15 units/day (steady trend)\n⏱️ Restock needed: ~3.3 days\n🎯 Status: Performing well, maintain current levels\n\n💡 **Tip:** Consider bundling with other Anastasia products for higher AOV.";
    }
    
    if (inputLower.includes("elta") || inputLower.includes("sunscreen")) {
      return "☀️ **Elta MD UV Physical SPF40 - URGENT ATTENTION:**\n\n🚨 Stock: 10 units (CRITICAL)\n💰 Price: $39.00\n📈 Sales: 40 units/day (+160% increase!)\n⏱️ Stockout: 0.25 days (6 hours!)\n🛒 Recommended order: 200 units immediately\n\n🌟 **Trending product** - Summer season driving demand. Consider featuring in marketing campaigns.";
    }
    
    if (inputLower.includes("mario") || inputLower.includes("badescu") || inputLower.includes("spray")) {
      return "💧 **Mario Badescu Facial Spray Analysis:**\n\n⚠️ Stock: 15 units (LOW)\n💰 Price: $12.00\n🔥 Sales: 50 units/day (+111% viral trend!)\n⏱️ Stockout: 0.3 days (7 hours)\n🛒 Urgent order: 250 units\n\n📱 **Social media boost** detected - likely from influencer mentions. Strike while the iron is hot!";
    }
    
    if (inputLower.includes("t3") || inputLower.includes("hair") || inputLower.includes("dryer")) {
      return "💨 **T3 Featherweight Hair Dryer - CODE RED:**\n\n🚨 Stock: 5 units (CRITICAL)\n💰 Price: $199.99 (high-value item)\n📈 Sales: 35 units/day (+438% surge!)\n⏱️ Stockout: 0.14 days (3 hours!)\n🛒 Emergency order: 175 units\n💎 **High-profit alert** - This is your revenue driver!";
    }
    
    // Revenue and profit insights
    if (inputLower.includes("revenue") || inputLower.includes("profit") || inputLower.includes("money") || inputLower.includes("earnings")) {
      return "💰 **Planet Beauty Revenue Insights:**\n\n🏆 **Top Revenue Drivers:**\n• T3 Hair Dryer: $999.95 (high-margin)\n• Borghese Serum: $1,580\n• Elta MD Sunscreen: $975\n\n📊 **Daily Revenue:** ~$3,200\n📈 **Trend:** +23% vs last month\n🎯 **Opportunity:** Focus on beauty tools (46% margin)\n\n💡 **Strategy:** Bundle complementary products to increase AOV by 35%.";
    }
    
    // Category insights
    if (inputLower.includes("category") || inputLower.includes("skincare") || inputLower.includes("makeup") || inputLower.includes("haircare")) {
      return "📂 **Planet Beauty Category Performance:**\n\n🥇 **Skincare:** 45% of sales (trending up)\n• Sun protection leading segment\n• Anti-aging serums growing +67%\n\n🥈 **Hair Tools:** 30% of sales (highest margin)\n• Professional dryers in high demand\n• Styling tools seasonal spike\n\n🥉 **Makeup:** 25% of sales (stable)\n• Brow products consistent performers\n• Color cosmetics need refresh\n\n💡 Focus inventory investment on skincare and tools for maximum ROI.";
    }
    
    // Help and capabilities
    if (inputLower.includes("help") || inputLower.includes("what can you") || inputLower.includes("how do you")) {
      return "🤖 **I'm your Planet Beauty AI assistant! Here's what I can help with:**\n\n📊 **Inventory Analysis:**\n• Real-time stock levels\n• Sales velocity tracking\n• Stockout predictions\n\n💡 **Smart Recommendations:**\n• Restocking suggestions\n• Quantity optimization\n• Trend identification\n\n📈 **Business Insights:**\n• Revenue analysis\n• Category performance\n• Profit optimization\n\n🚨 **Proactive Alerts:**\n• Critical stock warnings\n• Sales spike notifications\n• Reorder reminders\n\nJust ask me anything about your inventory!";
    }
    
    // Time-based suggestions
    const hour = new Date().getHours();
    if (inputLower.includes("good morning") || (hour >= 6 && hour < 12 && inputLower.includes("morning"))) {
      return "🌅 Good morning! Let's start your day with a quick inventory briefing:\n\n📊 **Overnight Updates:**\n• 3 critical alerts requiring attention\n• 2 trending products gained momentum\n• 1 restock order due today\n\n☕ Ready to tackle today's inventory challenges? What would you like to focus on first?";
    }
    
    // Default fallback with contextual suggestions
    const suggestions = [
      "Check my low stock items",
      "Show trending products",
      "What needs restocking urgently?",
      "Analyze my skincare category",
      "How's my revenue looking?",
      "Set up alerts for T3 Hair Dryer"
    ];
    
    const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
    
    return `I'm here to help with Planet Beauty inventory management! I can analyze stock levels, sales trends, and provide restocking recommendations.\n\n💡 **Try asking:** "${randomSuggestion}"\n\n🔍 **Or ask about:**\n• Specific products (Elta MD, Anastasia, etc.)\n• Category performance\n• Revenue insights\n• Reorder recommendations\n• Alert management`;
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMessage: AIMessage = { 
      sender: "User", 
      text: input, 
      timestamp: new Date() 
    };
    setMessages((prev: AIMessage[]) => [...prev, userMessage]);
    setLastInteraction(new Date());
    
    // Show typing indicator
    setIsTyping(true);
    
    // Simulate realistic response time
    const responseTime = Math.random() * 1500 + 500; // 500-2000ms
    
    setTimeout(() => {
      const response = getAIResponse(input);
      const aiMessage: AIMessage = { 
        sender: "AI", 
        text: response, 
        timestamp: new Date() 
      };
      
      setMessages((prev: AIMessage[]) => [...prev, aiMessage]);
      setIsTyping(false);
    }, responseTime);
    
    setInput("");
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Proactive suggestions based on inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      if (messages.length === 1) { // Only initial message
        const proactiveMessage: AIMessage = {
          sender: "AI",
          text: "💡 **Quick tip:** I noticed you just opened the assistant! Would you like me to show you today's critical alerts or trending products? Just ask!",
          timestamp: new Date()
        };
        setMessages((prev: AIMessage[]) => [...prev, proactiveMessage]);
      }
    }, 30000); // After 30 seconds of inactivity

    return () => clearTimeout(timer);
  }, [lastInteraction, messages.length]);

  return (
    <div className="pb-card pb-mb-6">
      <div className="pb-flex pb-justify-between pb-items-center pb-mb-4">
        <h2 className="pb-text-lg pb-font-medium">🤖 AI Assistant</h2>
        <div className="pb-text-sm" style={{ color: '#718096' }}>
          Ask about inventory, sales trends, or get recommendations
        </div>
      </div>
      
      {/* Chat Container */}
      <div 
        ref={chatScrollRef}
        className="bg-gray-50 pb-p-4 rounded-md pb-mb-4 max-h-80 pb-overflow-y-auto"
      >
        {messages.map((msg, index) => (
          <div 
            key={index} 
            className={`pb-mb-4 ${msg.sender === 'AI' ? 'text-gray-700' : 'text-blue-600'}`}
          >
            <div className={`inline-block max-w-full lg:max-w-5xl px-4 py-3 rounded-lg ${
              msg.sender === 'AI' 
                ? 'bg-white shadow-sm border border-pink-100' 
                : 'bg-blue-500 text-white ml-auto'
            }`}>
              <div className="pb-flex pb-items-center pb-mb-1">
                <strong className={msg.sender === 'AI' ? 'text-pink-600' : 'text-white'}>
                  {msg.sender === 'AI' ? '🤖 Planet Beauty AI' : '👤 You'}: 
                </strong>
                <span className="pb-text-xs pb-ml-2 opacity-75">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="whitespace-pre-line">{msg.text}</div>
            </div>
          </div>
        ))}
        
        {/* Typing Indicator */}
        {isTyping && (
          <div className="pb-mb-4 text-gray-700">
            <div className="inline-block max-w-xs lg:max-w-md px-4 py-3 rounded-lg bg-white shadow-sm border border-pink-100">
              <div className="pb-flex pb-items-center">
                <strong className="text-pink-600">🤖 Planet Beauty AI: </strong>
                <div className="pb-ml-2 pb-flex pb-space-x-1">
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="pb-flex pb-mb-3">
        <input
          type="text"
          className="pb-input pb-flex-1 mr-2"
          placeholder="Ask about inventory, sales trends, or restocking..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && !isTyping && handleSend()}
          disabled={isTyping}
          style={{ 
            borderColor: '#d81b60',
            boxShadow: input ? '0 0 0 3px rgba(216, 27, 96, 0.1)' : 'none'
          }}
        />
        <button 
          className="pb-btn-primary px-4" 
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          style={{
            backgroundColor: '#d81b60',
            opacity: (!input.trim() || isTyping) ? 0.6 : 1
          }}
        >
          {isTyping ? (
            <i className="fas fa-circle-notch fa-spin"></i>
          ) : (
            <i className="fas fa-paper-plane"></i>
          )}
        </button>
      </div>

      {/* Quick Suggestions */}
      <div className="pb-mt-3">
        <div className="pb-text-sm pb-mb-2" style={{ color: '#718096' }}>💡 Quick questions:</div>
        <div className="pb-flex pb-flex-wrap pb-gap-2">
          {[
            "Show critical alerts",
            "What's trending today?",
            "Check Elta MD status",
            "Revenue insights",
            "Restock recommendations",
            "Category performance"
          ].map((suggestion, index) => (
            <button
              key={index}
              className="pb-btn-secondary pb-text-sm"
              onClick={() => setInput(suggestion)}
              disabled={isTyping}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
