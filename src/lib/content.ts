import { getCollection } from 'astro:content';
export async function getProjects() {
 const p=await getCollection('projects',({data})=>!data.draft);
 return p.sort((a,b)=>(b.data.order??0)-(a.data.order??0));
}
export async function getPosts(){
 const p=await getCollection('posts',({data})=>!data.draft&&!data.password);
 return p.sort((a,b)=>b.data.published.getTime()-a.data.published.getTime());
}
export async function getMoments(){
 const m=await getCollection('dynamic');
 return m.sort((a,b)=>Number(b.data.pinned)-Number(a.data.pinned)||b.data.published.getTime()-a.data.published.getTime());
}
