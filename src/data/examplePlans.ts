interface QueryPlan {
  type: string;
  description: string;
  sql: string;
  plan: string;
}

export const examplePlans: QueryPlan[] = [
  {
    type: "Simple Scan",
    description: "Basic table scan operation",
    sql: `SELECT * FROM users WHERE id = 1;`,
    plan: `->  Seq Scan on users  (cost=0.00..1.01 rows=1 width=36)
    Filter: (id = 1)`
  },
  {
    type: "Index Scan",
    description: "Index scan with condition",
    sql: `SELECT * FROM users WHERE email = 'user@example.com';`,
    plan: `->  Index Scan using users_email_idx on users  (cost=0.00..8.27 rows=1 width=36)
    Index Cond: (email = 'user@example.com')`
  },
  {
    type: "Hash Join",
    description: "Basic hash join between two tables",
    sql: `SELECT u.name, o.order_date 
FROM orders o 
JOIN users u ON o.user_id = u.id;`,
    plan: `->  Hash Join  (cost=1.11..2.19 rows=10 width=68)
    Hash Cond: (orders.user_id = users.id)
    ->  Seq Scan on orders  (cost=0.00..1.05 rows=5 width=36)
    ->  Hash  (cost=1.01..1.01 rows=8 width=36)
          ->  Seq Scan on users  (cost=0.00..1.01 rows=8 width=36)`
  },
  {
    type: "Merge Join",
    description: "Sorted merge join operation",
    sql: `SELECT u.name, o.order_date 
FROM users u 
JOIN orders o ON u.id = o.user_id 
ORDER BY u.id;`,
    plan: `->  Merge Join  (cost=2.33..4.33 rows=100 width=72)
    Merge Cond: (users.id = orders.user_id)
    ->  Sort  (cost=1.16..1.17 rows=4 width=36)
          Sort Key: users.id
          ->  Seq Scan on users  (cost=0.00..1.04 rows=4 width=36)
    ->  Sort  (cost=1.16..1.17 rows=4 width=36)
          Sort Key: orders.user_id
          ->  Seq Scan on orders  (cost=0.00..1.04 rows=4 width=36)`
  },
  {
    type: "Complex Join",
    description: "Complex query with multiple joins and aggregations",
    sql: `SELECT u.country, o.status, COUNT(*) as order_count
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.status = 'completed'
  AND u.country = 'US'
GROUP BY u.country, o.status;`,
    plan: `->  HashAggregate  (cost=35.00..37.00 rows=200 width=48)
    Group Key: users.country, orders.status
    ->  Hash Join  (cost=10.00..30.00 rows=1000 width=40)
          Hash Cond: (orders.user_id = users.id)
          ->  Seq Scan on orders  (cost=0.00..15.00 rows=1000 width=16)
                Filter: (status = 'completed')
          ->  Hash  (cost=8.00..8.00 rows=200 width=24)
                ->  Seq Scan on users  (cost=0.00..7.00 rows=200 width=24)
                      Filter: (country = 'US')`
  },
  {
    type: "Window Function",
    description: "Query using window functions with partitioning",
    sql: `SELECT 
  name,
  department,
  salary,
  RANK() OVER (PARTITION BY department ORDER BY salary DESC) as salary_rank
FROM employees;`,
    plan: `->  WindowAgg  (cost=69.83..77.33 rows=500 width=47)
    ->  Sort  (cost=69.83..71.08 rows=500 width=39)
          Sort Key: department, salary DESC
          ->  Seq Scan on employees  (cost=0.00..11.00 rows=500 width=39)
    Window: [Partition by department order by salary desc]`
  },
  {
    type: "Nested Loops",
    description: "Complex nested loops with multiple conditions",
    sql: `SELECT c.name, o.order_date, p.product_name
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN products p ON o.product_id = p.id
WHERE c.id = 1000;`,
    plan: `->  Nested Loop  (cost=1.11..168.99 rows=10 width=140)
    ->  Hash Join  (cost=1.11..110.73 rows=100 width=92)
          Hash Cond: (orders.customer_id = customers.id)
          ->  Seq Scan on orders  (cost=0.00..85.00 rows=5000 width=52)
          ->  Hash  (cost=1.10..1.10 rows=1 width=44)
                ->  Index Scan using customers_pkey on customers  
                      (cost=0.00..1.10 rows=1 width=44)
                      Index Cond: (id = 1000)
    ->  Index Scan using products_pkey on products  
          (cost=0.00..0.58 rows=1 width=52)
          Index Cond: (id = orders.product_id)`
  },
  {
    type: "CTE With Join",
    description: "Common Table Expression with subsequent join",
    sql: `WITH active_users AS (
  SELECT * FROM users 
  WHERE last_login > '2024-01-01'
)
SELECT au.name, o.order_date
FROM orders o
JOIN active_users au ON o.user_id = au.id;`,
    plan: `->  Hash Join  (cost=10.25..18.96 rows=50 width=92)
    Hash Cond: (orders.user_id = active_users.id)
    ->  Seq Scan on orders  (cost=0.00..8.50 rows=850 width=44)
    ->  Hash  (cost=8.25..8.25 rows=100 width=48)
          ->  CTE Scan on active_users  (cost=0.00..8.25 rows=100 width=48)
                CTE active_users
                ->  Seq Scan on users  (cost=0.00..7.50 rows=100 width=48)
                      Filter: (last_login > '2024-01-01'::date)`
  },
  {
    type: "Subquery Scan",
    description: "Scan with correlated subquery",
    sql: `SELECT c.id, c.name,
  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count
FROM customers c
WHERE EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.id
);`,
    plan: `->  Subquery Scan on high_value_customers  (cost=11.75..19.75 rows=200 width=56)
    ->  HashAggregate  (cost=11.75..15.75 rows=200 width=56)
          Group Key: customers.id, customers.name
          ->  Hash Join  (cost=1.25..10.75 rows=200 width=56)
                Hash Cond: (orders.customer_id = customers.id)
                ->  Seq Scan on orders  (cost=0.00..8.50 rows=850 width=12)
                ->  Hash  (cost=1.20..1.20 rows=100 width=44)
                      ->  Seq Scan on customers  (cost=0.00..1.20 rows=100 width=44)`
  },
  {
    type: "Group By with Having",
    description: "Aggregation with having clause",
    sql: `SELECT user_id, COUNT(*) as transaction_count
FROM transactions
WHERE amount > 100.00
GROUP BY user_id
HAVING COUNT(*) > 10;`,
    plan: `->  HashAggregate  (cost=25.50..27.50 rows=50 width=44)
    Group Key: user_id
    Filter: (count(*) > 10)
    ->  Seq Scan on transactions  (cost=0.00..20.50 rows=1000 width=16)
          Filter: (amount > 100.00)`
  },
  {
    type: "Union All",
    description: "Union of multiple queries",
    sql: `SELECT name, department FROM current_employees WHERE department = 'Sales'
UNION ALL
SELECT name, department FROM former_employees WHERE department = 'Sales'
UNION ALL
SELECT name, department FROM contractors WHERE department = 'Sales';`,
    plan: `->  Append  (cost=0.00..30.50 rows=1500 width=48)
    ->  Seq Scan on current_employees  (cost=0.00..10.50 rows=500 width=48)
          Filter: (department = 'Sales')
    ->  Seq Scan on former_employees  (cost=0.00..10.50 rows=500 width=48)
          Filter: (department = 'Sales')
    ->  Seq Scan on contractors  (cost=0.00..9.50 rows=500 width=48)
          Filter: (department = 'Sales')`
  },
  {
    type: "Complex Analytics",
    description: "Advanced analytical query with multiple window functions",
    sql: `WITH yearly_stats AS (
  SELECT 
    e.id as employee_id,
    e.department,
    s.salary,
    e.hire_date,
    RANK() OVER (PARTITION BY e.department ORDER BY s.salary DESC) as salary_rank,
    AVG(s.salary) OVER (
      PARTITION BY e.department 
      ORDER BY e.hire_date 
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) as dept_running_avg
  FROM employees e
  JOIN salaries s ON e.id = s.employee_id
  WHERE s.year = 2024
)
SELECT * FROM yearly_stats;`,
    plan: `->  WindowAgg  (cost=138.24..148.24 rows=500 width=76)
    ->  WindowAgg  (cost=128.24..138.24 rows=500 width=68)
          ->  Sort  (cost=128.24..129.49 rows=500 width=60)
                Sort Key: department, salary DESC
                ->  HashAggregate  (cost=70.00..80.00 rows=500 width=60)
                      Group Key: employee_id, department
                      ->  Hash Join  (cost=35.00..65.00 rows=1000 width=52)
                            Hash Cond: (salaries.employee_id = employees.id)
                            ->  Seq Scan on salaries  (cost=0.00..25.00 rows=1000 width=24)
                                  Filter: (year = 2024)
                            ->  Hash  (cost=25.00..25.00 rows=800 width=28)
                                  ->  Seq Scan on employees  (cost=0.00..25.00 rows=800 width=28)
    Window 1: [Partition by department order by salary desc]
    Window 2: [Partition by department order by hire_date rows between unbounded preceding and current row]`
  }
];

export const getRandomPlan = (): QueryPlan => {
  return examplePlans[Math.floor(Math.random() * examplePlans.length)];
};