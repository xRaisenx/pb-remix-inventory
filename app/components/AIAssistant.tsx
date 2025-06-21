// app/components/AIAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import { BlockStack, TextField, Text, Spinner, LegacyCard, ButtonGroup, Link as PolarisLink } from '@shopify/polaris';
import { CustomCard } from '~/components/common/Card';
import { Button } from '~/components/common/Button';
import { useFetcher } from '@remix-run/react';
import { INTENT } from '~/utils/intents';

// --- Type Definitions for AIStructuredResponse ---
interface AIProductResponseItem {
  name: string;
  inventory: number;
  price: string;
  category?: string;
  shopifyProductId?: string;
}

interface AIListResponseItem {
  name: string;
  value: string | number;
  shopifyProductId?: string;
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
// Updated ProductDisplay to accept shopName
const ProductDisplay: React.FC<{ item: AIProductResponseItem; shopName?: string }> = ({ item, shopName = "your-shop" }) => (
  <LegacyCard.Section title={item.name}>
    <BlockStack gap="100">
      <Text as="p">Inventory: {item.inventory}</Text>
      <Text as="p">Price: ${item.price}</Text>
      {item.category && <Text as="p">Category: {item.category}</Text>}
      {item.shopifyProductId && (
        <PolarisLink
          url={`https://admin.shopify.com/store/${shopName}/products/${item.shopifyProductId.split('/').pop()}`}
          target="_blank"
          removeUnderline
        >
          View on Shopify
        </PolarisLink>
      )}
    </BlockStack>
  </LegacyCard.Section>
);

// Updated ListDisplay to accept shopName
const ListDisplay: React.FC<{ title: string; items: AIListResponseItem[]; shopName?: string }> = ({ title, items, shopName = "your-shop" }) => (
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
                  url={`https://admin.shopify.com/store/${shopName}/products/${item.shopifyProductId.split('/').pop()}`}
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
        <Button key={i} onClick={() => onQuestionClick(q)} size="slim">
          {q}
        </Button>
      ))}
    </ButtonGroup>
  </BlockStack>
);
// --- End Helper Display Components ---

interface AIAssistantProps {
  shopName?: string; // shopName is the part of the domain like "your-shop" from "your-shop.myshopify.com"
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ shopName }) => {
  const [inputValue, setInputValue] = useState('');
  const [conversation, setConversation] = useState<AIMessage[]>([
    { sender: 'AI', contentElement: <Text as="p">Welcome! Ask about inventory levels, sales trends, or restocking recommendations.</Text> }
  ]);
  const fetcher = useFetcher<{ structuredResponse?: AIStructuredResponse; error?: string }>();
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleInputChange = (value: string) => setInputValue(value);

  const handleSuggestedQuestionClick = (question: string) => {
    setInputValue(question);
    // Optionally, auto-submit if you want:
    // if (formRef.current) {
    //   const formData = new FormData(formRef.current);
    //   formData.set('query', question); // Ensure the query is updated if using this approach
    //   fetcher.submit(formData, { method: 'post', action: '/app/aiQuery' });
    //   const userMessage: AIMessage = { sender: 'User', contentElement: <Text as="p" fontWeight="bold">{question}</Text> };
    //   setConversation(prev => [...prev, userMessage]);
    //   setInputValue(''); // Clear input after auto-submitting
    // }
  };

  // This function is no longer directly called by a button, but by the form's onSubmit
  // const handleSend = () => {
  //   if (!inputValue.trim() || !formRef.current) return;
  //   const formData = new FormData(formRef.current);
  //   // No need to append intent and query here if they are part of the form's hidden/visible inputs
  //   fetcher.submit(formData, { method: 'post', action: '/app/aiQuery' });
  //   const userMessage: AIMessage = { sender: 'User', contentElement: <Text as="p" fontWeight="bold">{inputValue}</Text> };
  //   setConversation(prev => [...prev, userMessage]);
  //   setInputValue('');
  // };

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      let aiContentElement: JSX.Element;
      let suggestedQuestionsElement: JSX.Element | null = null;

      if (fetcher.data.structuredResponse) {
        const response = fetcher.data.structuredResponse;
        switch (response.type) {
          case 'product':
            aiContentElement = <ProductDisplay item={response.content as AIProductResponseItem} shopName={shopName} />;
            break;
          case 'list':
            aiContentElement = <ListDisplay title="Results:" items={response.content as AIListResponseItem[]} shopName={shopName} />;
            break;
          case 'summary':
            aiContentElement = <SummaryDisplay data={response.content as AISummaryResponseData} />;
            break;
          case 'text':
            aiContentElement = <Text as="p">{response.content as string}</Text>;
            break;
          case 'error':
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
        aiContentElement = <Text as="p" tone="critical">Error: {fetcher.data.error}</Text>;
      } else {
        aiContentElement = <Text as="p" tone="critical">Error: Received unexpected data from AI.</Text>;
      }

      const finalAiElement = (
        <BlockStack gap="300">
          {aiContentElement}
          {suggestedQuestionsElement}
        </BlockStack>
      );

      setConversation(prev => [...prev, { sender: 'AI', contentElement: finalAiElement }]);
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
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
            maxHeight: '300px',
            overflowY: 'auto',
            padding: 'var(--p-space-400)',
            border: '1px solid var(--p-color-border)',
            borderRadius: 'var(--p-border-radius-200)'
          }}
        >
          <BlockStack gap="300">
            {conversation.map((msg, index) => (
              <BlockStack key={index} gap="100">
                <Text as="p" fontWeight={msg.sender === 'AI' ? 'medium' : 'bold'} variant="bodyMd">
                  {msg.sender}:
                </Text>
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
        <fetcher.Form
          method="post"
          action="/app/aiQuery" // Ensure this is your AI query endpoint
          ref={formRef}
          onSubmit={(e) => {
            // This onSubmit is for client-side effects before submission
            // The actual submission is handled by the form itself
            if (!inputValue.trim()) {
              e.preventDefault(); // Prevent submission if input is empty
              return;
            }
            const userMessage: AIMessage = { sender: 'User', contentElement: <Text as="p" fontWeight="bold">{inputValue}</Text> };
            setConversation(prev => [...prev, userMessage]);
            setInputValue(''); // Clear input after adding to conversation and allowing form to submit
          }}
        >
          <input type="hidden" name="intent" value={INTENT.AI_CHAT} />
          <TextField
            label="Your question"
            labelHidden
            name="query" // This will be part of the FormData
            placeholder="Ask about Planet Beauty inventory..."
            value={inputValue}
            onChange={handleInputChange}
            autoComplete="off"
            connectedRight={
              <Button
                submit // This makes the button trigger the form submission
                variant="primary"
                loading={fetcher.state === 'submitting'}
                disabled={fetcher.state === 'submitting' || !inputValue.trim()}
                // onClick is not needed here as `submit` prop handles it
              >
                Send
              </Button>
            }
          />
        </fetcher.Form>
      </BlockStack>
    </CustomCard>
  );
};
