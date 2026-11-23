import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://gozono.com',
  // URLs del sitio WordPress anterior, para no romper enlaces ni SEO.
  redirects: {
    '/about': '/nosotros',
    '/services': '/servicios',
    '/projects': '/proyectos',
    '/contact': '/contacto',
    '/documentacion-tecnica': '/recursos/material-complementario',
    '/normativas-y-estandares': '/recursos/normativas',
    '/support-portal': '/soporte',
  },
});
