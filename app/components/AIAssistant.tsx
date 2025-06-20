// app/components/AIAssistant.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Card,
  BlockStack,
  TextField,
  Button,
  Text,
  Scrollable,
  Spinner,
  Box, // Import Box for layout
  InlineStack // Import InlineStack for follow-up questions
} from "@shopify/polaris";
import { SendIcon } from "@shopify/polaris-icons"; // Send icon

// Import the new card components
import ProductResponseCard from "./ProductResponseCard";
import ListResponseCard from "./ListResponseCard";
import SummaryResponseCard from "./SummaryResponseCard";

interface AiMessage {
  id: string;
  sender: 'User' | 'AI' | 'Error';
  content: React.ReactNode; // Changed from text: string
  followUpQuestions?: string[];
}

interface FetcherData {
  aiResponse?: {
    type: 'product' | 'list' | 'summary' | 'text';
    data: any;
    followUpQuestions?: string[];
  };
  error?: string;
}

export default function AIAssistant() {
  const fetcher = useFetcher<FetcherData>();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      id: `ai-init-${Date.now()}`,
      sender: "AI",
      content: <Text as="p">Welcome! How can I help with your inventory today?</Text>
    }
  ]);
  const scrollableRef = useRef<HTMLDivElement>(null);

  const handleInputChange = useCallback(setInputValue, []);

  const handleSendMessage = useCallback((message?: string) => {
    const currentMessage = message || inputValue;
    if (currentMessage.trim() === "") return;

    setMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      sender: "User",
      content: <Text as="p">{currentMessage}</Text>
    }]);

    // Temporary mocking for ProductResponseCard
    if (currentMessage.toLowerCase().includes("show product example")) {
      const exampleProductData = {
          productImageUrl: "", // Test fallback by making it empty
          productName: "Mockup Product (No Image): Anastasia Beverly Hills Clear Brow Gel",
          price: "$23.00",
          inventory: 50,
          inventoryStatusClass: "status-healthy",
          salesVelocity: "15 units/week",
          stockoutDays: "3.33 days",
          responseDetails: "This is a top-performing product with consistent sales. Consider highlighting it in your next campaign.",
          shopifyProductUrl: "#", // Example URL
          onRestockAction: () => console.log("Restock action triggered for example product"),
      };
      setMessages(prev => [...prev, {
          id: `ai-mock-${Date.now()}`,
          sender: "AI",
          content: <ProductResponseCard {...exampleProductData} />,
          followUpQuestions: ["What are its sales trends?", "Any similar products?"]
      }]);
      setInputValue("");
      return; // Prevent fetcher submission for this mocked case
    }
     // Temporary mocking for ListResponseCard
    if (currentMessage.toLowerCase().includes("show list example")) {
      const exampleListData = {
        title: "Trending Mockup Products",
        products: [
          { productImageUrl: "", productName: "Mock Product A (No Image)", price: "$25.00", inventory: 100, salesVelocity: "10/day" },
          { productImageUrl: "invalid-url-should-fail", productName: "Mock Product B (Invalid URL)", price: "$45.00", inventory: 30, salesVelocity: "5/day" },
          { productImageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png?format=webp&v=1530129081", productName: "Mock Product C (Valid Image)", price: "$65.00", inventory: 70, salesVelocity: "20/day" },
        ],
        responseDetails: "These products are currently trending. Testing image fallbacks."
      };
      setMessages(prev => [...prev, {
        id: `ai-mock-list-${Date.now()}`,
        sender: "AI",
        content: <ListResponseCard {...exampleListData} />,
        followUpQuestions: ["More details on Product A?", "What about top sellers overall?"]
      }]);
      setInputValue("");
      return;
    }

    // Temporary mocking for SummaryResponseCard
    if (currentMessage.toLowerCase().includes("show summary example")) {
      const exampleSummaryData = {
        title: "Mockup Inventory Summary",
        totalProducts: 120,
        lowStockCount: 15,
        totalInventoryValue: "$25,500.00",
        alerts: [ {alertType: "alert-critical", alertMessage: "Critical: 5 SKUs are out of stock!"}, {alertType: "alert-warning", alertMessage: "Warning: 10 SKUs are below safety stock levels."}],
        responseDetails: "Overall inventory health is moderate. Attention needed for out-of-stock and low-stock items."
      };
      setMessages(prev => [...prev, {
        id: `ai-mock-summary-${Date.now()}`,
        sender: "AI",
        content: <SummaryResponseCard {...exampleSummaryData} />,
        followUpQuestions: ["List critical stock items.", "Which items are selling fastest?"]
      }]);
      setInputValue("");
      return;
    }
    // New mock cases for error handling
    else if (currentMessage.toLowerCase().includes("show fetcher error example")) {
      setMessages(prev => [...prev, {
          id: `err-mock-${Date.now()}`,
          sender: "Error",
          content: <Text as="p" tone="critical">This is a simulated error message from the backend for 'fetcher error example'.</Text>
      }]);
      setInputValue("");
      return;
    }
    else if (currentMessage.toLowerCase().includes("show unknown type example")) {
      // This simulates an AI response that the frontend doesn't know how to render.
      // For this test, we directly add the "I didn't understand" message.
      // In a real scenario, fetcher.submit would happen, and the useEffect would handle the unknown type.
      setMessages(prev => [...prev, {
          id: `ai-mock-unknown-${Date.now()}`,
          sender: "AI", // Or 'Error' if preferred for system messages of this kind
          content: (
            <Text as="p">
              I'm sorry, I didn't understand 'show unknown type example'. You can ask me about things
              like 'show trending products', 'inventory of [product name]', or 'give me an inventory summary'.
            </Text>
          )
      }]);
      setInputValue("");
      return;
    }

    fetcher.submit(
      { query: currentMessage, _action: "ai_chat" },
      { method: "post", action: "/app/aiQuery" }
    );
    setInputValue("");
  }, [inputValue, fetcher, setMessages]);

  useEffect(() => {
    const fetcherData = fetcher.data as FetcherData | null; // Type assertion
    if (fetcherData?.aiResponse) {
      const { type, data, followUpQuestions } = fetcherData.aiResponse;
      let messageContent: React.ReactNode;
      const fallbackErrorMessage = (cardType: string) => (
        <Text as="p" tone="critical">
          Sorry, I couldn't load the details for the {cardType}. Please try again.
        </Text>
      );
      const unrecognizedQueryMessage = (
        <Text as="p">
          I'm sorry, I didn't understand that. You can ask me about things like 'show trending products',
          'inventory of [product name]', or 'give me an inventory summary'.
        </Text>
      );

      if (!data && type !== 'text') { // Check for data early if not a simple text response
        messageContent = fallbackErrorMessage(type);
      } else {
        switch (type) {
          case 'product':
            if (!data) messageContent = fallbackErrorMessage('product');
            else messageContent = <ProductResponseCard {...data} />;
            break;
          case 'list':
            if (!data) messageContent = fallbackErrorMessage('list');
            else messageContent = <ListResponseCard {...data} />;
            break;
          case 'summary':
            if (!data) messageContent = fallbackErrorMessage('summary');
            else messageContent = <SummaryResponseCard {...data} />;
            break;
          case 'text':
            if (!data || !data.text) messageContent = unrecognizedQueryMessage;
            else messageContent = <Text as="p">{data.text}</Text>;
            break;
          default:
            // Handles unknown type or if data.text is missing for 'text' type somehow
            messageContent = unrecognizedQueryMessage;
            break;
        }
      }
      setMessages((prev) => [...prev, {
        id: `ai-${Date.now()}`,
        sender: "AI",
        content: messageContent,
        followUpQuestions
      }]);

    } else if (fetcherData?.error) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        sender: "Error",
        content: <Text as="p" tone="critical"><i className="fas fa-exclamation-triangle mr-2"></i>{fetcherData.error}</Text>
      }]);
    } else if (fetcher.state === 'idle' && !fetcherData?.aiResponse && !fetcherData?.error) {
      // This case handles when fetcher completes but there's no aiResponse and no specific error.
      // This can be treated as an unrecognized query.
      setMessages((prev) => [...prev, {
        id: `ai-unrecognized-${Date.now()}`,
        sender: "AI",
        content: (
          <Text as="p">
            I'm sorry, I didn't understand that. You can ask me about things like 'show trending products',
            'inventory of [product name]', or 'give me an inventory summary'.
          </Text>
        )
      }]);
    }

    if (fetcher.state === 'idle' && fetcher.data != null) {
        // Potentially clear data if it's not meant to be sticky, or use a different mechanism
        // For now, this is simplified as the mock logic bypasses typical fetcher data flow for AI responses
    }

  }, [fetcher.data, fetcher.state, setMessages]); // Removed fetcher.formAction as clearing is handled differently or less critical with direct state updates

  useEffect(() => {
    const scrollableElement = scrollableRef.current?.querySelector('[data-polaris-scrollable]'); // querySelector for the actual scrollable div if Scrollable wraps another div
    if (scrollableElement) {
      scrollableElement.scrollTop = scrollableElement.scrollHeight;
    } else if (scrollableRef.current) { // Fallback for direct ref if it is the scrollable element
      scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessageContent = (msg: AiMessage) => {
    const senderTextTone = msg.sender === 'Error' ? 'critical' : msg.sender === 'AI' ? 'subdued' : 'subdued';
    // Using Polaris Text component's tone for color, and prepending an icon for errors.
    const senderPrefix = msg.sender === 'Error' ? <><i className="fas fa-exclamation-circle mr-2"></i>Error: </> : `${msg.sender}: `;

    return (
      <Box
        paddingBlockEnd="200" paddingBlockStart="200"
        paddingInlineStart="400" paddingInlineEnd="400" // Increased padding
        background={msg.sender === 'Error' ? 'bg-critical-subdued' : msg.sender === 'AI' ? 'bg-surface-secondary': undefined}
        borderColor={msg.sender === 'Error' ? 'border-critical-subdued': undefined}
        borderWidth={msg.sender === 'Error' ? "025": undefined}
        borderRadius="100"
      >
        <Text as="p" fontWeight="bold" tone={senderTextTone}>
          {senderPrefix}
        </Text>

        <Box paddingBlockStart="100"> {/* Add some space between sender and content */}
          {msg.content}
        </Box>

        {msg.followUpQuestions && msg.followUpQuestions.length > 0 && (
          <Box paddingTop="200">
            <BlockStack gap="200"> {/* Keep gap for elements within follow-ups */}
              <Text as="p" variant="bodySm" tone="subdued">Suggested follow-ups:</Text>
              <InlineStack gap="300" wrap={true}> {/* Increased gap for buttons */}
                {msg.followUpQuestions.map((q, i) => (
                  <Button key={i} size="slim" onClick={() => handleSendMessage(q)} variant="secondary">
                    {q}
                  </Button>
                ))}
              </InlineStack>
            </BlockStack>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">AI Assistant</Text>
        <div
          ref={scrollableRef}
          style={{
            border: '1px solid var(--p-color-border)',
            borderRadius: 'var(--p-border-radius-200)',
            height: "400px", // Increased height
            overflowY: 'auto' // Direct overflow control
          }}
        >
          {/* Removed Polaris Scrollable as direct overflowY is used */}
            <BlockStack gap="0"> {/* Reduced gap for tighter message packing */}
              {messages.map((msg) => (
                <div key={msg.id} className={`message-container message-${msg.sender.toLowerCase()}`}>
                  {renderMessageContent(msg)}
                </div>
              ))}
              {fetcher.state === "submitting" && (
                 <Box padding="200" paddingBlockStart="400">
                  <InlineStack gap="200" blockAlign="center" inlineAlign="center">
                    <Spinner accessibilityLabel="AI is thinking" size="small" />
                    <Text as="p" tone="subdued">AI is thinking...</Text>
                  </InlineStack>
                 </Box>
              )}
            </BlockStack>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
          <TextField
            label="Your query"
            labelHidden
            value={inputValue}
            onChange={handleInputChange}
            autoComplete="off"
            disabled={fetcher.state === "submitting"}
            placeholder="Try: 'show product example' or 'show fetcher error example'"
            connectedRight={
              <Button
                variant="primary"
                onClick={() => handleSendMessage()}
                disabled={inputValue.trim() === "" || fetcher.state === "submitting"}
                icon={SendIcon}
                accessibilityLabel="Send message" // Accessibility improvement
              />
            }
          />
        </form>
      </BlockStack>
    </Card>
  );
}
