import { MotionConfig } from 'framer-motion';
import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RouteRailNav } from './components/apex/RouteRailNav';
import { ToastTelemetry } from './components/apex/ToastTelemetry';
import { ApexPassProvider, PassStage } from './motion/ApexPass';
import { IgnitionIntro } from './motion/IgnitionIntro';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

const Book = lazy(() => import('./pages/Book'));
const ManageBooking = lazy(() => import('./pages/ManageBooking'));
const Operations = lazy(() => import('./pages/Operations'));
const Process = lazy(() => import('./pages/Process'));
const Services = lazy(() => import('./pages/Services'));

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ApexPassProvider>
        <RouteRailNav />
        <main id="main">
          <PassStage>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/book" element={<Book />} />
                <Route path="/services" element={<Services />} />
                <Route path="/process" element={<Process />} />
                <Route path="/manage" element={<ManageBooking />} />
                <Route path="/manage/:bookingId" element={<ManageBooking />} />
                <Route path="/operations" element={<Operations />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </PassStage>
        </main>
        <ToastTelemetry />
        <IgnitionIntro />
      </ApexPassProvider>
    </MotionConfig>
  );
}

function RouteLoading() {
  return (
    <div className="grid min-h-[100svh] place-items-center">
      <span className="label flex items-center gap-2">
        <span className="dot-live" /> Loading route
      </span>
    </div>
  );
}

