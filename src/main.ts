import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import './layout.css';

mount(App, { target: document.getElementById('app')! });

// offline support (public/sw.js); not in development, where Vite serves modules
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw', e)));
}
