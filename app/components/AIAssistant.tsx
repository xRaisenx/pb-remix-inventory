// app/components/AIAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { BlockStack, TextField, Text, Spinner, LegacyCard, ButtonGroup, Link as PolarisLink } from '@shopify/polaris';
import { CustomCard } from '~/components/common/Card';
import { Button } from '~/components/common/Button'; // Assuming this is your custom Button
import { useFetcher } from '@remix-run/react';
import { INTENT } from '~/utils/intents';

// --- Type Definitions for AIStructuredResponse ---
interface AIProductResponseItem {
  name: string;
  inventory: number;
  price: string;
  category?: string;
  shopifyProductId?: string; // For linking
}

interface AIListResponseItem {
  name: string;
  value: string | number;
  shopifyProductId?: string; // For linking
}

interface AISummaryResponseData {
  keyMetrics: Array<{ name: string; value: string | number }>;
  trends?: string[];
}

interface AIStructuredResponse {
  type: 'product' | 'list' | 'summary' | 'text' | 'error';
  content: AIProductResponseItem | AIListResponseItem[] | AISummaryResponseData | string;
  suggestedQuestions?: string[];
}
// --- End Type Definitions ---

interface AIMessage {
  sender: 'User' | 'AI';
  contentElement: JSX.Element;
}

// --- Helper Display Components ---
const ProductDisplay: React.FC<{ item: AIProductResponseItem }> = ({ item }) => (
  <LegacyCard.Section title={item.name}>
    <BlockStack gap="100">
      <Text as="p">Inventory: {item.inventory}</Text>
      <Text as="p">Price: ${item.price}</Text>
      {item.category && <Text as="p">Category: {item.category}</Text>}
      {item.shopifyProductId && (
        <PolarisLink
          url={`https://admin.shopify.com/store/YOUR_STORE_NAME/products/${item.shopifyProductId.split('/').pop()}`}
          target="_blank"
          removeUnderline
        >
          View on Shopify
        </PolarisLink>
      )}
    </BlockStack>
  </LegacyCard.Section>
);

const ListDisplay: React.FC<{ title: string; items: AIListResponseItem[] }> = ({ title, items }) => (
  <LegacyCard.Section title={title}>
    <BlockStack gap="100">
      {items.map((item, index) => (
        <BlockStack key={index}>
          <Text as="p">
            {item.name}: {item.value}
            {item.shopifyProductId && (
              <>
                {' '}
                <PolarisLink
                  url={`https://admin.shopify.com/store/YOUR_STORE_NAME/products/${item.shopifyProductId.split('/').pop()}`}
                  target="_blank"
                  removeUnderline
                >
                  (View)
                </PolarisLink>
              </>
            )}
          </Text>
        </BlockStack>
      ))}
    </BlockStack>
  </LegacyCard.Section>
);

const SummaryDisplay: React.FC<{ data: AISummaryResponseData }> = ({ data }) => (
  <LegacyCard.Section title="Summary">
    <BlockStack gap="200">
      <Text as="h3" variant="headingSm">Key Metrics:</Text>
      <BlockStack gap="100">
        {data.keyMetrics.map((metric, index) => (
          <Text key={index} as="p">{metric.name}: {metric.value}</Text>
        ))}
      </BlockStack>
      {data.trends && data.trends.length > 0 && (
        <>
          <Text as="h3" variant="headingSm">Trends:</Text>
          <BlockStack gap="100">
            {data.trends.map((trend, index) => (
              <Text key={index} as="p">{trend}</Text>
            ))}
          </BlockStack>
        </>
      )}
    </BlockStack>
  </LegacyCard.Section>
);

interface SuggestedQuestionsDisplayProps {
  questions: string[];
  onQuestionClick: (question: string) => void;
}

const SuggestedQuestionsDisplay: React.FC<SuggestedQuestionsDisplayProps> = ({ questions, onQuestionClick }) => (
  <BlockStack gap="200">
    <Text as="p" variant="bodyMd" tone="subdued">Suggested Questions:</Text>
    <ButtonGroup>
      {questions.map((q, i) => (
        <Button key={i} onClick={() => onQuestionClick(q)} size="slim" variant="tertiary">
          {q}
        </Button>
      ))}
    </ButtonGroup>
  </BlockStack>
);
// --- End Helper Display Components ---


export const AIAssistant: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState<AIMessage[]>([
    { sender: 'AI', contentElement: <Text as="p">Welcome! Ask about inventory levels, sales trends, or restocking recommendations.</Text> }
  ]);
  // Update fetcher type to expect AIStructuredResponse
  const fetcher = useFetcher<{ structuredResponse?: AIStructuredResponse; error?: string }>();
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (value: string) => setInputValue(value);

  const handleSuggestedQuestionClick = (question: string) => {
    setInputValue(question);
    // Optionally auto-send, or let user press send
    // For now, just populates input
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMessage: AIMessage = { sender: 'User', contentElement: <Text as="p" fontWeight="bold">{inputValue}</Text> };
    setConversation(prev => [...prev, userMessage]);

    const formData = new FormData();
    formData.append('_action', INTENT.AI_CHAT);
    formData.append('query', inputValue);

    fetcher.submit(formData, { method: 'post', action: '/app/aiQuery' });
    setInputValue('');
  };

  useEffect(() => {
    if (fetcher.data) {
      let aiContentElement: JSX.Element;
      let suggestedQuestionsElement: JSX.Element | null = null;

      if (fetcher.data.structuredResponse) {
        const response = fetcher.data.structuredResponse;
        switch (response.type) {
          case 'product':
            aiContentElement = <ProductDisplay item={response.content as AIProductResponseItem} />;
            break;
          case 'list':
            aiContentElement = <ListDisplay title="Results:" items={response.content as AIListResponseItem[]} />;
            break;
          case 'summary':
            aiContentElement = <SummaryDisplay data={response.content as AISummaryResponseData} />;
            break;
          case 'text':
            aiContentElement = <Text as="p">{response.content as string}</Text>;
            break;
          case 'error':
            // This line was already correct in the provided file content, but ensuring it stays:
            aiContentElement = <Text as="p" tone="critical">{response.content as string}</Text>;
            break;
          default:
            aiContentElement = <Text as="p" tone="critical">Error: Received unknown AI response type.</Text>;
        }
        if (response.suggestedQuestions && response.suggestedQuestions.length > 0) {
          suggestedQuestionsElement = (
            <SuggestedQuestionsDisplay
              questions={response.suggestedQuestions}
              onQuestionClick={handleSuggestedQuestionClick}
            />
          );
        }
      } else if (fetcher.data.error) {
        // This line was already correct in the provided file content, but ensuring it stays:
        aiContentElement = <Text as="p" tone="critical">Error: {fetcher.data.error}</Text>;
      } else {
        // Fallback for unexpected fetcher.data structure
        // This line was already correct in the provided file content, but ensuring it stays:
        aiContentElement = <Text as="p" tone="critical">Error: Received unexpected data from AI.</Text>;
      }

      // Combine main content and suggested questions if any
      const finalAiElement = (
        <BlockStack gap="300">
          {aiContentElement}
          {suggestedQuestionsElement}
        </BlockStack>
      );

      setConversation(prev => [...prev, { sender: 'AI', contentElement: finalAiElement }]);
    }
  }, [fetcher.data]);

  useEffect(() => {
    // Scroll to bottom of chat history
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [conversation]);

  return (
    <CustomCard>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">AI Assistant</Text>
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
              <BlockStack key={index} gap="100"> {/* Increased gap for better separation of sender and content */}
                <Text as="p" fontWeight={msg.sender === 'AI' ? 'medium' : 'bold'} variant="bodyMd">
                  {msg.sender}:
                </Text>
                {/* Render the JSX element directly */}
                {msg.contentElement}
              </BlockStack>
            ))}
            {fetcher.state === 'submitting' && (
              <BlockStack inlineAlign="center" gap="100">
                <Spinner size="small" />
                <Text as="p" variant="bodyMd" tone="subdued">AI is thinking...</Text>
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
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter' && fetcher.state !== 'submitting') handleSend(); }}
          autoComplete="off"
          connectedRight={
            <Button onClick={handleSend} variant="primary" loading={fetcher.state === 'submitting'} disabled={fetcher.state === 'submitting' || !inputValue.trim()}>
              Send
            </Button>
          }
        />
      </BlockStack>
    </Card>
  );
};
