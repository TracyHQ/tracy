import { defineConfig } from 'astro/config';
import imageInspector from '@lexingtonthemes/astro-image-inspector';

export default defineConfig({
  integrations: [imageInspector()],
});
