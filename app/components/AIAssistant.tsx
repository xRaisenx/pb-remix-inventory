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
  Spinner
} from "@shopify/polaris";
import { SendIcon } from "@shopify/polaris-icons"; // Send icon

interface AiMessage {
  id: string;
  sender: 'User' | 'AI' | 'Error'; // Added 'Error' sender type
  text: string;
}

interface FetcherData {
  response?: string; // AI's response text
  error?: string;    // Error message string
}

export default function AIAssistant() {
  const fetcher = useFetcher<FetcherData>();
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<AiMessage[]>([
    { id: `ai-init-${Date.now()}`, sender: "AI", text: "Welcome! How can I help with your inventory today?" }
  ]);
  const scrollableRef = useRef<HTMLDivElement>(null); // For auto-scrolling

  const handleInputChange = useCallback(setInputValue, [setInputValue]);

  const handleSendMessage = useCallback(() => {
    if (inputValue.trim() === "") return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, sender: "User", text: inputValue }]);
    fetcher.submit(
      { query: inputValue, _action: "ai_chat" }, // Ensure _action is sent
      { method: "post", action: "/app/aiQuery" } // Path to your AI action route
    );
    setInputValue("");
  }, [inputValue, fetcher]);

  useEffect(() => {
    const data = fetcher.data ?? {};
    if (data.response) {
      setMessages((prev) => [...prev, { id: `ai-${Date.now()}`, sender: "AI", text: data.response as string }]);
    } else if (data.error) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, sender: "Error", text: data.error as string }]);
    }
    // Clear fetcher data by re-submitting a GET to the same action endpoint.
    // This prevents the useEffect from re-triggering on the same data if, for example,
    // the component re-renders for other reasons.
    if (fetcher.formAction) {
      fetcher.submit(null, { method: 'get', action: fetcher.formAction });
    }
  }, [fetcher.data, fetcher.formAction, fetcher]); // Added fetcher.formAction to dependency array

  useEffect(() => { // Auto-scroll to bottom
    const scrollableElement = scrollableRef.current?.querySelector('[data-polaris-scrollable]');
    if (scrollableElement) {
      scrollableElement.scrollTop = scrollableElement.scrollHeight;
    }
  }, [messages]);

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">AI Assistant</Text>
        <div ref={scrollableRef} style={{border: '1px solid var(--p-color-border)', borderRadius: 'var(--p-border-radius-200)'}}>
          <Scrollable shadow style={{ height: "300px" }} focusable>
            <BlockStack gap="300">
              {messages.map((msg) => (
                <BlockStack key={msg.id} gap="100">
                  <Text as="p" fontWeight="bold">{msg.sender}:</Text>
                  <Text as="p">{msg.text}</Text>
                </BlockStack>
              ))}
              {fetcher.state === "submitting" && (
                <div
                  id="spinner-box"
                  style={{ marginLeft: 'auto', marginRight: 'auto', width: 'fit-content', paddingBlockStart: '12px' }}
                >
                  <Spinner accessibilityLabel="AI is thinking" size="small" />
                </div>
              )}
            </BlockStack>
          </Scrollable>
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
          <TextField
            label="Your query"
            value={inputValue}
            onChange={handleInputChange}
            autoComplete="on"
            disabled={fetcher.state === "submitting"}
            placeholder="Ask about inventory levels, restocking recommendations, or sales trends..."
            connectedRight={
              <Button
                variant="primary"
                onClick={handleSendMessage}
                disabled={inputValue.trim() === "" || fetcher.state === "submitting"}
                icon={SendIcon}
              />
            }
          />
        </form>
      </BlockStack>
    </Card>
  );
}
