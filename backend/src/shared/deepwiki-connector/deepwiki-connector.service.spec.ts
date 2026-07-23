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
    expect(fragment.tools[0]).not.toHaveProperty('allowed_tools');
    expect(fragment.betas).toEqual(['mcp-client-2025-11-20']);
  });

  it('with allowedTools includes that array as allowed_tools, everything else unchanged', () => {
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
        allowed_tools: ['read_wiki_structure', 'ask_question'],
      },
    ]);
    expect(fragment.betas).toEqual(['mcp-client-2025-11-20']);
  });
});
