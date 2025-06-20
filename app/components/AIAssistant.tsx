// app/components/AIAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { BlockStack, TextField, Text, Spinner } from '@shopify/polaris';
import { Card } from '~/components/common/Card';
import { Button } from '~/components/common/Button';
import { useFetcher } from '@remix-run/react';

interface AIMessage {
  sender: 'User' | 'AI';
  text: string;
}

export const AIAssistant: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState<AIMessage[]>([
    { sender: 'AI', text: 'Welcome! Ask about inventory levels, sales trends, or restocking recommendations.' }
  ]);
  const fetcher = useFetcher<{ response?: string; error?: string }>();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (value: string) => setInputValue(value);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: AIMessage = { sender: 'User', text: inputValue };
    setConversation(prev => [...prev, userMessage]);

    const formData = new FormData();
    formData.append('_action', 'ai_chat');
    formData.append('query', inputValue);

    fetcher.submit(formData, { method: 'post', action: '/app/aiQuery' });
    setInputValue('');
  };

  useEffect(() => {
    if (fetcher.data) {
      if (fetcher.data.response) {
        setConversation(prev => [...prev, { sender: 'AI', text: fetcher.data.response as string }]);
      } else if (fetcher.data.error) {
        setConversation(prev => [...prev, { sender: 'AI', text: `Error: ${fetcher.data.error}` }]);
      }
    }
  }, [fetcher.data]);

  useEffect(() => {
    // Scroll to bottom of chat history
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [conversation]);

  return (
    <Card title="AI Assistant">
      <BlockStack gap="400">
        <div
          ref={chatScrollRef}
          style={{
            maxHeight: '300px', // Increased height
            overflowY: 'auto',
            padding: 'var(--p-space-400)',
            border: '1px solid var(--p-color-border)',
            borderRadius: 'var(--p-border-radius-200)'
          }}
        >
          <BlockStack gap="300"> {/* Slightly more gap for messages */}
            {conversation.map((msg, index) => (
              <BlockStack key={index} gap="050">
                <Text as="p" fontWeight={msg.sender === 'AI' ? 'medium' : 'bold'} variant="bodyMd">
                  {msg.sender}:
                </Text>
                <Text as="p" variant="bodyMd" color={msg.text.startsWith('Error:') ? 'critical' : undefined}>
                  {msg.text}
                </Text>
              </BlockStack>
            ))}
            {fetcher.state === 'submitting' && (
              <BlockStack inlineAlign="center" gap="100">
                <Spinner size="small" />
                <Text as="p" variant="bodyMd" color="subdued">AI is thinking...</Text>
              </BlockStack>
            )}
          </BlockStack>
        </div>
        <TextField
          label="Your question"
          labelHidden
          placeholder="Ask about Planet Beauty inventory..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={(event) => { if (event.key === 'Enter' && fetcher.state !== 'submitting') handleSend(); }}
          autoComplete="off"
          connectedRight={
            <Button onClick={handleSend} variant="primary" loading={fetcher.state === 'submitting'} disabled={fetcher.state === 'submitting'}>
              Send
            </Button>
          }
        />
      </BlockStack>
    </Card>
  );
};
