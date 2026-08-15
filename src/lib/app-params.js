/**
 * Параметры приложения.
 *
 * Раньше здесь читались app_id / access_token / app_base_url из Base44.
 * Теперь остался только адрес своего API и токен текущей сессии.
 */
import { getToken } from '@/lib/self-hosted-db';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export const appParams = {
  apiBaseUrl,
  get token() {
    return getToken();
  },
  get fromUrl() {
    return typeof window === 'undefined' ? '/' : window.location.href;
  },
};

export default appParams;
