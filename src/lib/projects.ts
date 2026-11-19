import type { CollectionEntry } from 'astro:content';
export type Project={
 slug:string;title:string;subtitle:string;description:string;status:string;tags:string[];image:string;
 highlights:{title:string;detail:string;state:'implemented'|'verifying'|'planned'}[];
 links:{label:string;value:string}[];
};
export function toProject(e:CollectionEntry<'projects'>):Project {
 const d=e.data;
 const image=d.image.startsWith('/')?'https://0701000.xyz'+d.image:
    (d.image&&!/^https?:\/\//i.test(d.image)?'https://0701000.xyz/'+d.image:d.image);
 return {slug:e.id,title:d.title,subtitle:d.subtitle,description:d.description,status:d.status,
 tags:d.tags,image,highlights:d.highlights,links:d.link.map(x=>({label:x.label,value:x.value}))};
}
