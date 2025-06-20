// app/components/AIAssistant.tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Card, BlockStack, TextField, Button, Text, Scrollable, Spinner, Box, InlineStack } from "@shopify/polaris";
import { SendIcon } from "@shopify/polaris-icons";
import type { AIStructuredResponse } from "~/services/ai.server";

// NOTE: You will need to create these components based on your UI designs.
// These are placeholder components.
const ProductResponseCard = ({ product }: { product: any }) => <Card><Text as="p">Product: {product.name}</Text></Card>;
const ListResponseCard = ({ title, items }: { title: string, items: any[] }) => <Card><Text as="p">List: {title} ({items.length} items)</Text></Card>;
const SummaryResponseCard = ({ summary }: { summary: any }) => <Card><Text as="p">Summary: {summary.totalProducts} products</Text></Card>;

interface AiMessage {
  id: string;
  sender: 'User' | 'AI' | 'Error';
  content: React.ReactNode;
  followUpQuestions?: string[];
}

interface FetcherData {
  structuredResponse?: AIStructuredResponse;
}

export default function AIAssistant() {
  const fetcher = useFetcher<FetcherData>();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([
    { id: `ai-init-${Date.now()}`, sender: "AI", content: <Text as="p">Welcome! How can I help with your inventory today?</Text> }
  ]);
  const scrollableRef = useRef<HTMLDivElement>(null);

  const handleInputChange = useCallback(setInputValue, []);

  const handleSendMessage = useCallback((message?: string) => {
    const currentMessage = message || inputValue;
    if (currentMessage.trim() === "") return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, sender: "User", content: <Text as="p">{currentMessage}</Text> }]);

    fetcher.submit(
      { query: currentMessage, _action: "ai_chat" },
      { method: "post", action: "/app/aiQuery" }
    );
    setInputValue("");
  }, [inputValue, fetcher]);

  useEffect(() => {
    const response = fetcher.data?.structuredResponse;
    if (fetcher.state === 'idle' && response) {
      let messageContent: React.ReactNode;

      switch (response.type) {
        case 'product':
          messageContent = <ProductResponseCard product={response.product} />;
          break;
        case 'list':
          messageContent = <ListResponseCard title={response.title} items={response.items} />;
          break;
        case 'summary':
          messageContent = <SummaryResponseCard summary={response.summary} />;
          break;
        case 'text':
          messageContent = <Text as="p">{response.content}</Text>;
          break;
        case 'error':
          setMessages((prev) => [...prev, { id: `err-${Date.now()}`, sender: "Error", content: <Text as="p" tone="critical">{response.message}</Text> }]);
          return; // Exit early for errors
      }

      setMessages((prev) => [...prev, {
        id: `ai-${Date.now()}`,
        sender: "AI",
        content: messageContent,
        followUpQuestions: response.suggestedQuestions
      }]);
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (scrollableRef.current) {
      scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight;
    }
  }, [messages]);

  const renderMessageContent = (msg: AiMessage) => (
    <Box
      padding="400"
      background={msg.sender === 'User' ? 'bg-surface' : 'bg-surface-secondary'}
      borderRadius="200"
    >
      <BlockStack gap="200">
        <Text as="p" fontWeight="bold">{msg.sender}</Text>
        {msg.content}
        {msg.followUpQuestions && (
          <Box paddingTop="200">
            <InlineStack gap="300" wrap={true}>
              {msg.followUpQuestions.map((q, i) => (
                <Button key={i} size="slim" onClick={() => handleSendMessage(q)}>{q}</Button>
              ))}
            </InlineStack>
          </Box>
        )}
      </BlockStack>
    </Box>
  );

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">AI Assistant</Text>
        <div ref={scrollableRef} style={{ height: "400px", overflowY: 'auto' }}>
          <Scrollable shadow style={{height: '100%'}}>
            <BlockStack gap="400" padding="400">
              {messages.map((msg) => <div key={msg.id}>{renderMessageContent(msg)}</div>)}
              {fetcher.state === "submitting" && (
                 <InlineStack gap="200" blockAlign="center"><Spinner size="small" /><Text as="p" tone="subdued">AI is thinking...</Text></InlineStack>
              )}
            </BlockStack>
          </Scrollable>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
          <TextField
            label="Your query" labelHidden value={inputValue} onChange={handleInputChange}
            autoComplete="off" disabled={fetcher.state === "submitting"}
            placeholder="Ask about low stock, inventory value..."
            connectedRight={
              <Button submit variant="primary" icon={SendIcon} disabled={!inputValue.trim() || fetcher.state === "submitting"} />
            }
          />
        </form>
      </BlockStack>
    </Card>
  );
}