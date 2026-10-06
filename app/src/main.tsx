import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import Layout from './components/Layout';
import { ToastProvider } from './components/ui';
import Overview from './pages/Overview';
import Registry from './pages/Registry';
import Routing from './pages/Routing';
import Access from './pages/Access';
import Guard from './pages/Guard';
import Telemetry from './pages/Telemetry';
import Spend from './pages/Spend';
import NotFound from './pages/NotFound';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="registry" element={<Registry />} />
            <Route path="routing" element={<Routing />} />
            <Route path="access" element={<Access />} />
            <Route path="guard" element={<Guard />} />
            <Route path="telemetry" element={<Telemetry />} />
            <Route path="spend" element={<Spend />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
