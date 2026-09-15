import { ViteReactSSG } from 'vite-react-ssg';
import { routes } from './routes';
import { installDeploySkewGuard } from './lib/deploy-skew';
import './index.css';

installDeploySkewGuard();

// vite-react-ssg entry: prerenders each route to static HTML at build time and
// hydrates on the client. Replaces the old ReactDOM.createRoot CSR mount.
export const createRoot = ViteReactSSG({ routes });
