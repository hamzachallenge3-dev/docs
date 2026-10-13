/** Concrete argument shapes for model calls; role allowlists still authorize execution. */
const shapes: Record<string, Record<string, string>> = {
  workspace_read: {path:'string'}, workspace_list:{path:'string'},
  workspace_write:{path:'string',content:'string'}, workspace_grep:{path:'string',pattern:'string'},
  dispatch_agent:{agent_id:'string',subtask:'string'}, clean_leads:{text:'string',csv:'string'},
  sheets_to_json:{csv:'string',dialect:'string'}, extract_contacts:{html:'string',url:'string'},
  seo_audit_html:{html:'string',url:'string'}, forge_detect:{url:'string'}, github_url_tricks:{url:'string'},
  hub_list_agents:{pack:'string'}, hub_agent_browse:{query:'string',agent_id:'string',pack:'string'},
  hub_tools13_lookup:{query:'string'}, hub_freellmapi_chat:{prompt:'string',model:'string'},
  film_pack_prepare:{video_path:'string',out_path:'string',interval:'number',max_frames:'number'},
  n8n_workflow_validate:{workflow:'object'}, context_compact:{text:'string',max_lines:'number'},
  html_extract_links:{html:'string'}, hub_tools13_capabilities:{},
};
export function modelTool(name: string) {
  return {type:'function', function:{ name, description:name,
    parameters:{type:'object', properties:Object.fromEntries(Object.entries(shapes[name] ?? {}).map(([key,type]) => [key,{type}]))} }};
}
