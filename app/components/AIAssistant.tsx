// app/components/AIAssistant.tsx
import React, { useState } from 'react';
import { BlockStack, TextField, Text } from '@shopify/polaris';
import { Card } from '~/components/common/Card';
import { Button } from '~/components/common/Button'; // Assuming this is your common button

export const AIAssistant: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState([
    { sender: 'AI' as const, text: 'Welcome! Ask about inventory, sales, or restocking.' }
  ]);

  const handleInputChange = (value: string) => setInputValue(value);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const userMessage = { sender: 'User' as const, text: inputValue };
    // Dummy AI response
    const aiResponse = { sender: 'AI' as const, text: `I received: "${inputValue}". My real responses are coming soon!` };
    setConversation([...conversation, userMessage, aiResponse]);
    setInputValue('');
  };

  return (
    <Card title="AI Assistant">
      <BlockStack gap="400">
        <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px' }}> {/* Chat history box */}
          <BlockStack gap="200">
            {conversation.map((msg, index) => (
              <Text key={index} as="p">
                <strong>{msg.sender}:</strong> {msg.text}
              </Text>
            ))}
          </BlockStack>
        </div>
        <TextField
          label="Your question"
          labelHidden
          placeholder="Ask about Planet Beauty inventory..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={(event) => { if (event.key === 'Enter') handleSend(); }}
          autoComplete="off"
          connectedRight={
            <Button onClick={handleSend} variant="primary">Send</Button>
          }
        />
      </BlockStack>
    </Card>
  );
};
