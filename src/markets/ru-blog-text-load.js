import {russianArticleLinks} from './ru-editorial.js';
import {stripUnreleasedBlogLinks} from '../blog-posts.js';
const files=import.meta.glob('./ru-blog/*.js');
const loaded=new Map();
export const loadedBlogText=slug=>loaded.get(slug)||null;
export const primeBlogText=(slug,text)=>{if(slug&&text)loaded.set(slug,stripUnreleasedBlogLinks(russianArticleLinks(text)));};
export async function loadBlogText(slug) {
 if(loaded.has(slug))return loaded.get(slug);
 const file=files[`./ru-blog/${slug}.js`];if(!file)return null;
 const text=stripUnreleasedBlogLinks(russianArticleLinks((await file()).default));loaded.set(slug,text);return text;
}
