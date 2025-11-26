// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './authContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode> // Comment this out
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  // </React.StrictMode> // Comment this out
);
