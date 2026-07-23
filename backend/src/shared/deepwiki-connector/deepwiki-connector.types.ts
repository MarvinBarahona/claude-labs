export interface McpRequestFragment {
  mcpServers: [{ type: 'url'; url: string; name: string }];
  tools: [
    { type: 'mcp_toolset'; mcp_server_name: string; allowed_tools?: string[] },
  ];
  betas: ['mcp-client-2025-11-20'];
}
