export async function picpayToken(clientId,clientSecret){
 if(!/^[\w-]{1,128}$/.test(clientId)||!/^\w{1,512}$/.test(clientSecret))throw Error("Credenciais inválidas.");
 const res=await fetch("https://ecommerce-api.svcp.ppay.me/sandbox/oauth2/token",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret}),redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error("Credenciais de homologação recusadas.");
 const d=await res.json();
 if(typeof d.access_token!=="string"||!d.access_token)throw Error("Token inválido.");
 return d.access_token;
}
export function verifyPicpayCharge(charge,reference,cents){
 return charge?.merchantChargeId===reference&&charge.chargeStatus==="PAID"&&charge.amount===cents&&Array.isArray(charge.transactions)&&charge.transactions.length===1&&charge.transactions[0].paymentType==="PIX"&&charge.transactions[0].transactionStatus==="PAID"&&charge.transactions[0].amount===cents;
}

const sandboxBase="https://ecommerce-api.svcp.ppay.me/sandbox/v1";
export async function createPicpayCharge(token,reference,cents,customer){
 if(!/^[a-zA-Z0-9-]{6,36}$/.test(reference)||!Number.isSafeInteger(cents)||cents<1||cents>2147483647)throw Error("Invalid charge");
 if(!customer||typeof customer.name!=="string"||typeof customer.email!=="string"||!["CPF","CNPJ"].includes(customer.documentType)||typeof customer.document!=="string")throw Error("Invalid customer");
 const res=await fetch(sandboxBase+"/charge/pix",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({paymentSource:"GATEWAY",merchantChargeId:reference,customer,transactions:[{amount:cents,pix:{expiration:600}}]}),redirect:"error",signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error("PicPay sandbox charge failed");
 const charge=await res.json();
 if(charge.merchantChargeId!==reference||charge.amount!==cents)throw Error("Charge mismatch");
 return charge;
}
export async function findPicpayCharge(token,reference){
 if(!/^[a-zA-Z0-9-]{6,36}$/.test(reference))throw Error("Invalid reference");
 const res=await fetch(sandboxBase+"/charge/"+encodeURIComponent(reference),{headers:{Authorization:"Bearer "+token,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error("PicPay sandbox verification failed");
 return res.json();
}
