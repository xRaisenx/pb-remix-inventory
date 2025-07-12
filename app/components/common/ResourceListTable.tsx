import type { IndexTableProps} from '@shopify/polaris';
import { IndexTable, Card as PolarisCard } from '@shopify/polaris';
import React from 'react';

// Keep headings simple for now, Polaris.IndexTableHeading[] is complex for a generic wrapper initially
interface CustomHeading {
  id: string;
  title: string;
  hidden?: boolean;
  flush?: boolean;
}

interface ResourceListTableProps {
  resourceName: { singular: string; plural: string };
  items: ReadonlyArray<any>;
  headings: CustomHeading[]; // Simplified headings
  renderItemRow: (item: any, index: number, headings: CustomHeading[]) => React.ReactNode[]; // Returns array of cell contents for a row
  // Props for selection (optional)
  selectable?: boolean;
  selectedResources?: string[];
  onSelectionChange?: IndexTableProps['onSelectionChange'];
  // Pagination and sorting can be added later
}

export const ResourceListTable: React.FC<ResourceListTableProps> = ({
  resourceName,
  items,
  headings,
  renderItemRow,
  selectable = false, // Defaulting to false unless explicitly interactive
  selectedResources,
  onSelectionChange,
}) => {
  const resourceIDResolver = (item: any): string => {
    return item.id || items.indexOf(item).toString(); // Ensure item has an id or use index
  };

  return (
    <PolarisCard>
      <IndexTable
        resourceName={resourceName}
        itemCount={items.length}
        headings={headings.map(h => ({id: h.id, title: h.title, hidden: h.hidden, flush: h.flush})) as any}
        selectable={false}
        
        
        // condensed // Useful for denser tables
      >
        {items.map((item, index) => {
          const cells = renderItemRow(item, index, headings);
          return (
            <IndexTable.Row
              id={resourceIDResolver(item)}
              key={resourceIDResolver(item)}
              position={index}
              // onClick if rows should be clickable (would need a handler prop)
            >
              {headings.map((heading, cellIndex) => (
                <IndexTable.Cell key={`${heading.id}-${index}`}>
                  {cells[cellIndex]}
                </IndexTable.Cell>
              ))}
            </IndexTable.Row>
          );
        })}
      </IndexTable>
    </PolarisCard>
  );
};
