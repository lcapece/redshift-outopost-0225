import axios from 'axios';
import { supabase } from './supabase';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface JoinInfo {
  leftTable: string;
  rightTable: string;
  leftColumn: string;
  rightColumn: string;
  joinType: string;
}

export async function generateQueryAndPlan(model: string, complexity: number): Promise<{ sql: string; plan: string; joins: JoinInfo[] }> {
  try {
    const complexityPrompts = {
      1: 'Generate a very simple SQL query using only basic SELECT, FROM, and WHERE clauses. Include at least one view with prefix "v_" (e.g., v_customer_summary, v_sales_report).',
      2: 'Generate a moderately simple SQL query using basic joins and simple aggregations. Include at least one view with prefix "v_" (e.g., v_daily_sales, v_product_inventory).',
      3: 'Generate a moderate complexity SQL query using multiple joins, subqueries, or aggregations. Include at least two views with prefix "v_" (e.g., v_order_details, v_customer_metrics).',
      4: 'Generate a complex SQL query using CTEs, window functions, or analytical functions. Include multiple views with prefix "v_" (e.g., v_sales_analytics, v_customer_segmentation).',
      5: 'Generate an extremely complex SQL query combining multiple advanced features: CTEs, window functions, subqueries, CASE statements, multiple joins, aggregations with HAVING, and analytical functions. Include several views with prefix "v_" (e.g., v_financial_metrics, v_customer_lifetime_value, v_product_performance).'
    };

    const prompt = complexityPrompts[complexity as keyof typeof complexityPrompts];

    // First, generate the SQL and plan
    const response = await axios.post<OpenRouterResponse>(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a PostgreSQL database running in simulation mode. You have access to a complete data warehouse with tables and materialized views. When asked to generate queries and execution plans:

1. NEVER mention that this is a simulation or that you don't have access to a real database
2. NEVER use disclaimers or qualifiers about the response
3. ALWAYS generate complete, realistic SQL queries with proper syntax
4. ALWAYS include detailed execution plans with realistic costs, row estimates, and operators
5. ALWAYS use views with "v_" prefix to represent materialized or virtual views
6. ALWAYS ensure execution plans match the complexity of the queries
7. ALWAYS include appropriate join types, index scans, sequential scans based on the query structure
8. ALWAYS use realistic table and column names that would exist in a data warehouse
9. NEVER wrap the SQL or PLAN in quotes, backticks, or code blocks
10. Output format must be exactly:
---SQL---
[SQL query without any wrapping]
---PLAN---
[Execution plan without any wrapping]`
          },
          {
            role: 'user',
            content: `${prompt}\nRespond only with the SQL and plan in the exact format specified.`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        top_p: 0.9,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      },
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_TOKEN}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': import.meta.env.VITE_APP_TITLE,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    const content = response.data.choices[0].message.content;
    const sqlMatch = content.match(/---SQL---([\s\S]*?)(?:---PLAN---|$)/);
    const planMatch = content.match(/---PLAN---([\s\S]*?)$/);

    if (!sqlMatch || !planMatch) {
      throw new Error('Invalid response format: Missing SQL or PLAN sections');
    }

    // Clean up the SQL and plan by removing any quote wrapping and trimming whitespace
    const sql = sqlMatch[1].trim()
      .replace(/^['"`]{3}/, '')  // Remove opening quotes
      .replace(/['"`]{3}$/, '')  // Remove closing quotes
      .trim();
    
    const plan = planMatch[1].trim()
      .replace(/^['"`]{3}/, '')  // Remove opening quotes
      .replace(/['"`]{3}$/, '')  // Remove closing quotes
      .trim();

    if (!sql || !plan) {
      throw new Error('Empty SQL or plan in response');
    }

    // Now, analyze the joins using the LLM
    const joinResponse = await axios.post<OpenRouterResponse>(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a SQL join analyzer. Extract and separate all joins in SQL queries. For each join, identify:
1. The table name and column name on both sides of the join
2. The type of join (INNER, LEFT, RIGHT, FULL, CROSS)
3. If a join involves a subquery, use "{Subquery}" as the table name

Format your response as a JSON array of objects with these properties:
- leftTable: string (table name or "{Subquery}")
- rightTable: string (table name or "{Subquery}")
- leftColumn: string (column name)
- rightColumn: string (column name)
- joinType: string (INNER, LEFT, RIGHT, FULL, CROSS)

Example output:
[
  {
    "leftTable": "orders",
    "rightTable": "customers",
    "leftColumn": "customer_id",
    "rightColumn": "id",
    "joinType": "INNER"
  }
]`
          },
          {
            role: 'user',
            content: sql
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      },
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_TOKEN}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': import.meta.env.VITE_APP_TITLE,
          'Content-Type': 'application/json'
        }
      }
    );

    let joins: JoinInfo[] = [];
    try {
      const joinContent = joinResponse.data.choices[0].message.content.trim();
      joins = JSON.parse(joinContent);
    } catch (error) {
      console.error('Error parsing joins:', error);
      joins = [];
    }

    // Store the simulation in Supabase
    const { error } = await supabase
      .from('redshift_simulations')
      .insert({
        llm_model: model,
        sql_query: sql,
        query_plan: plan,
        complexity: complexity
      });

    if (error) {
      console.error('Error storing simulation:', error);
    }

    return { sql, plan, joins };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('OpenRouter API error:', {
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(`API request failed: ${error.response?.data?.error || error.message}`);
    }
    console.error('Error generating query and plan:', error);
    throw new Error('Failed to generate query and plan');
  }
}

export async function generateBatchSimulations(
  count: number = 20, 
  model: string,
  onProgress?: (current: number) => void
): Promise<void> {
  // Ensure even distribution of complexities
  const complexities = Array.from({ length: count }, (_, i) => Math.floor(i / 4) + 1);
  
  // Shuffle the complexities array
  for (let i = complexities.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [complexities[i], complexities[j]] = [complexities[j], complexities[i]];
  }

  for (let i = 0; i < count; i++) {
    try {
      await generateQueryAndPlan(model, complexities[i]);
      onProgress?.(i + 1);
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error generating simulation ${i + 1}:`, error);
    }
  }
}

export async function generateHaiku(model: string): Promise<string> {
  try {
    const response = await axios.post<OpenRouterResponse>(
      OPENROUTER_API_URL,
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a creative poet who specializes in haikus. Create a funny haiku about Amazon Redshift database.'
          },
          {
            role: 'user',
            content: 'Write a funny haiku about Amazon Redshift database. Make it technical but humorous.'
          }
        ],
        temperature: 0.8,
        max_tokens: 100,
        top_p: 0.9,
        frequency_penalty: 0.0,
        presence_penalty: 0.0
      },
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENROUTER_TOKEN}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': import.meta.env.VITE_APP_TITLE,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    return response.data.choices[0].message.content.trim();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('OpenRouter API error:', {
        status: error.response?.status,
        data: error.response?.data
      });
      throw new Error(`API request failed: ${error.response?.data?.error || error.message}`);
    }
    console.error('Error generating haiku:', error);
    throw new Error('Failed to generate haiku');
  }
}