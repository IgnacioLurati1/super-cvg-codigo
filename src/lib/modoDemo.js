// Kept apart from the sample data so that production never ships it.
export const TOKEN_DEMO = 'demo';
export const esDemo = (token) => import.meta.env.DEV && token === TOKEN_DEMO;
