import { Injectable } from '@nestjs/common';
import { McpRequestFragment } from './deepwiki-connector.types';

const DEEPWIKI_SERVER_NAME = 'deepwiki';
const DEEPWIKI_URL = 'https://mcp.deepwiki.com/mcp';

@Injectable()
export class DeepwikiConnectorService {
  buildRequestFragment(options?: {
    allowedTools?: string[];
  }): McpRequestFragment {
    return {
      mcpServers: [
        { type: 'url', url: DEEPWIKI_URL, name: DEEPWIKI_SERVER_NAME },
      ],
      tools: [
        {
          type: 'mcp_toolset',
          mcp_server_name: DEEPWIKI_SERVER_NAME,
          ...(options?.allowedTools
            ? { allowed_tools: options.allowedTools }
            : {}),
        },
      ],
      betas: ['mcp-client-2025-11-20'],
    };
  }
}
