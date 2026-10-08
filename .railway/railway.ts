import { defineRailway, github, preserve, project, service } from 'railway/iac';

// This partial owns only the web service. Existing databases and other services
// are outside its scope. Credentials remain in Railway.
export const partial = 'app-web-cx-web';
export default defineRailway(() => {
  const web = service('app-web-cx-', {
    source: github('kealto61-cpu/app-web-cx-', { branch: 'main', rootDirectory: 'railway' }),
    start: 'bun run server.ts',
    healthcheck: '/health',
    env: {
      DATABASE_URL: preserve(),
      DEMO_ADMIN_PIN: preserve(),
      VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      DATA_MODE: 'SIMULATED',
    },
  });
  return project('zucchini-integrity', { resources: [web] });
});
