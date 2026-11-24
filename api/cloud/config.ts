import { handleCloudConfig } from '../../server/cloud/config.js';

export const GET = (request: Request): Promise<Response> => handleCloudConfig(request, process.env);
