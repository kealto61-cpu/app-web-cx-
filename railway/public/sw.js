self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?event.data.text():""}}
  const title=data.title||"Clínica AMA · Seguimiento quirúrgico";
  const options={
    body:data.body||"Hay una nueva actualización del proceso quirúrgico.",
    tag:data.tag||"cx-companion",
    renotify:true,
    requireInteraction:false,
    data:data.data||{url:"/?follow=1"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=(event.notification.data&&event.notification.data.url)||"/?follow=1";
  event.waitUntil((async()=>{
    const all=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of all){
      try{
        const u=new URL(client.url);
        if(u.origin===self.location.origin){
          await client.focus();
          if("navigate" in client)await client.navigate(target);
          return;
        }
      }catch{}
    }
    if(clients.openWindow)await clients.openWindow(target);
  })());
});