// Main Entry Point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Game } from './ui';

// Global styles
const style = document.createElement('style');
style.textContent = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body, #root {
    height: 100%;
    width: 100%;
  }
  body {
    background: #0d0d1a;
    color: #fff;
    font-family: "JetBrains Mono", "Fira Code", "Consolas", monospace;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: #0d0d1a;
  }
  ::-webkit-scrollbar-thumb {
    background: #2a2a4e;
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3a3a5e;
  }
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 4px;
    background: #1a1a3e;
    border-radius: 2px;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: #00ccff;
    border-radius: 50%;
    margin-top: -6px;
    box-shadow: 0 0 4px #00ccff;
  }
  input[type="range"]::-moz-range-track {
    height: 4px;
    background: #1a1a3e;
    border-radius: 2px;
    border: none;
  }
  input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #00ccff;
    border-radius: 50%;
    border: none;
    box-shadow: 0 0 4px #00ccff;
  }
  select {
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2300ccff' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 32px;
  }
`;
document.head.appendChild(style);

// Load font
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
document.head.appendChild(fontLink);

// Create root and render
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Game />
  </React.StrictMode>
);