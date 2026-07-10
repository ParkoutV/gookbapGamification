<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Script Files Policy
All custom Node.js utility and database scripts (e.g. `.mjs` files) should be placed in the `/scripts/` directory and should be excluded from version control. 
*(Note: Framework configuration files like `eslint.config.mjs` and `postcss.config.mjs` must remain in the project root.)*
