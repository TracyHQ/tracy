export default [
  {
    files: ["lib/**/*.js", "test/**/*.js", "test/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        fetch: "readonly",
        Response: "readonly",
        Request: "readonly",
        Headers: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        structuredClone: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        Map: "readonly",
        Set: "readonly",
        Promise: "readonly",
        Error: "readonly",
        TypeError: "readonly",
        RangeError: "readonly",
        ReferenceError: "readonly",
        DOMException: "readonly",
        Date: "readonly",
        Math: "readonly",
        JSON: "readonly",
        Number: "readonly",
        String: "readonly",
        Boolean: "readonly",
        Array: "readonly",
        Object: "readonly",
        RegExp: "readonly",
        Symbol: "readonly",
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["lib/client.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        location: "readonly",
        history: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
      }
    }
  }
];
