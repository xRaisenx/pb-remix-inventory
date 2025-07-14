// app/components/AIAssistant.tsx
import { useState } from "react";
import { Card, Text, TextField, Button, LegacyStack, Badge } from "@shopify/polaris";

interface AIAssistantProps {
  shopId: string;
}

export function AIAssistant({ shopId }: AIAssistantProps) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("intent", "AI_CHAT");
      formData.append("query", query);

      const res = await fetch("/app/aiQuery", {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      setResponse(data.structuredResponse);
    } catch (error) {
      console.error("AI Query Error:", error);
      setResponse({ type: "error", content: "Failed to process query. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <LegacyStack vertical>
        <Text variant="headingMd" as="h3">AI Assistant</Text>
        <TextField
          label="Ask about your inventory"
          value={query}
          onChange={setQuery}
          placeholder="e.g., How much lipstick inventory do I have?"
          autoComplete="off"
        />
        <Button 
          variant="primary" 
          onClick={handleQuery} 
          loading={loading}
          disabled={!query.trim()}
        >
          Ask AI
        </Button>
        
        {response && (
          <Card>
            {response.type === "error" ? (
              <Badge tone="critical">{response.content}</Badge>
            ) : (
              <Text as="p">{response.content}</Text>
            )}
          </Card>
        )}
      </LegacyStack>
    </Card>
  );
}
