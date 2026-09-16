import { mount } from 'svelte';
import App from './app.svelte';
import './styles.css';

const target = document.getElementById('app');
if (!target) {
  throw new Error('Missing app mount target');
}
mount(App, { target });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js');
  });
}
