export interface McpRequestFragment {
  mcpServers: [{ type: 'url'; url: string; name: string }];
  tools: [
    {
      type: 'mcp_toolset';
      mcp_server_name: string;
      default_config?: { enabled: boolean };
      configs?: Record<string, { enabled: boolean }>;
    },
  ];
  betas: ['mcp-client-2025-11-20'];
}
