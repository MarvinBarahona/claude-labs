import { DeepwikiConnectorService } from './deepwiki-connector.service';

describe('DeepwikiConnectorService', () => {
  it('with no options returns the fixed DeepWiki server, an unrestricted toolset, and the mcp-client beta', () => {
    const service = new DeepwikiConnectorService();

    const fragment = service.buildRequestFragment();

    expect(fragment.mcpServers).toEqual([
      { type: 'url', url: 'https://mcp.deepwiki.com/mcp', name: 'deepwiki' },
    ]);
    expect(fragment.tools).toEqual([
      { type: 'mcp_toolset', mcp_server_name: 'deepwiki' },
    ]);
    expect(fragment.tools[0]).not.toHaveProperty('default_config');
    expect(fragment.tools[0]).not.toHaveProperty('configs');
    expect(fragment.betas).toEqual(['mcp-client-2025-11-20']);
  });

  it('with allowedTools disables all tools by default and enables only the named ones via configs', () => {
    const service = new DeepwikiConnectorService();

    const fragment = service.buildRequestFragment({
      allowedTools: ['read_wiki_structure', 'ask_question'],
    });

    expect(fragment.mcpServers).toEqual([
      { type: 'url', url: 'https://mcp.deepwiki.com/mcp', name: 'deepwiki' },
    ]);
    expect(fragment.tools).toEqual([
      {
        type: 'mcp_toolset',
        mcp_server_name: 'deepwiki',
        default_config: { enabled: false },
        configs: {
          read_wiki_structure: { enabled: true },
          ask_question: { enabled: true },
        },
      },
    ]);
    expect(fragment.betas).toEqual(['mcp-client-2025-11-20']);
  });
});
