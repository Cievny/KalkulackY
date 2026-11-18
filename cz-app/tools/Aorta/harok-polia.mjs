// Hárky výrobcov, ktoré sú len tlačové PDF bez formulárových polí: tu je zoznam polí
// (súradnice v bodoch od ĽAVÉHO HORNÉHO rohu strany) a funkcia, ktorá ich do PDF doplní.
// Volá sa raz – pri nahrávaní šablóny do úložiska. Od tej chvíle sa PDF správa ako
// bežný vyplniteľný formulár (rovnako ako hárok Cook).

function endurant(){
  const T=[], C=[];                       // T: [meno, x, y, š, v, voľby]   C: [meno, x, y]
  const t=(n,x,y,w,h,o)=>T.push([n,x,y,w,h,o||{}]);
  // hlavička
  t('ct_date',334,69,112,11.5);t('ct_slice',338,84.5,108,11.5);
  t('patient_id',494,69,136,11.5);t('physician',532,84.5,98,11.5);t('eval_date',514,100,116,11.5);
  t('dob_d',690,69,40,11.5,{c:1});t('dob_m',738,69,32,11.5,{c:1});t('dob_y',777,69,37,11.5,{c:1});
  t('hospital',695,84.5,119,11.5);t('proc_date',698,100,116,11.5);
  // angulácie
  t('ang_supra',92.9,151.9,42.7,16.8,{c:1});t('ang_infra',212.4,192.6,57.5,16.8,{c:1});
  // priemery + poloha stola (ľavý stĺpec, pravý stĺpec)
  [['D1a',201.5],['D1b',214.4],['D2',233.4],['D3',265.3],['D4R',287.8],['D5R',300.8],['D6R',313.7],['D7R',394.7]]
    .forEach(([n,y])=>{t(n,57.6,y+.4,31.3,12.5,{c:1});t(n+'_tp',89.3,y+.4,31.3,12.5,{c:1});});
  [['D4L',319.0],['D5L',332.0],['D6L',344.9]].forEach(([n,y])=>{t(n,248,y+.4,31.3,12.5,{c:1});t(n+'_tp',279.7,y+.4,31.3,12.5,{c:1});});
  t('D7L',234.6,396.4,31.3,12.5,{c:1});t('D7L_tp',266.2,396.4,31.3,12.5,{c:1});
  // dĺžky
  t('L1',247.4,213.4,31.3,12.5,{c:1});t('L2',247.4,229.9,31.3,12.5,{c:1});
  t('L3R',172.1,336.3,31.3,12.5,{c:1});t('L3L',172.1,351.4,31.3,12.5,{c:1});
  t('tot_R',289.5,262.6,37,11,{c:1});t('tot_L',289.5,275.3,37,11,{c:1});
  // tabuľka objednávky: 8 riadkov × (ks, kód) × 2
  for(let i=0;i<8;i++){
    const y=450.2+i*14.1;
    t('qty'+(i+1),37.6,y,31,12,{c:1});t('pc'+(i+1),71,y,108,12);
    t('qty'+(i+9),181,y,31.6,12,{c:1});t('pc'+(i+9),215,y,108.6,12);
  }
  // voľný text
  t('drawing',531,178,281,166,{m:1});t('comments',531,364,281,110,{m:1});
  // zaškrtávacie políčka: [skupina, y, [možnosť, x]…] – meno poľa = skupina_možnosť
  [['sma',136.0,['yes',404.2],['no',432.2]],
   ['renal',149.6,['right',426.6],['left',461.1]],
   ['risk',171.1,['short',351.8],['wide',393.7],['angled',441.5]],
   ['risk',178.9,['conical',351.8]],
   ['thrombus',201.5,['nil',351.8],['mild',375.7],['moderate',405.5],['severe',454.4]],
   ['neckcalc',223.0,['nil',351.8],['mild',375.7],['moderate',405.5],['severe',454.4]],
   ['anchors',244.3,['yes',351.8],['no',379.8]],
   ['lumbar',256.7,['yes',416.5],['no',444.5]],
   ['ima',269.2,['yes',403.9],['no',431.8]],
   ['rcalc',290.6,['nil',351.8],['mild',375.7],['moderate',405.5],['severe',454.4]],
   ['lcalc',310.9,['nil',351.8],['mild',375.7],['moderate',405.5],['severe',454.4]],
   ['coil',323.3,['right',393.1],['left',427.5],['no',457.1]],
   ['bifur',336.5,['right',428.6],['left',463.0]],
  ].forEach(([g,y,...o])=>o.forEach(([n,x])=>C.push([g+'_'+n,x-.3,y+.6])));
  return {strana:0,text:T,check:C,checkSize:7.2};
}

export const POLIA={endurant:endurant()};

// Doplní polia do PDF. pdfLib = modul pdf-lib, bytes = pôvodné PDF. Vráti nové PDF (Uint8Array).
export async function doplnPolia(pdfLib,bytes,def){
  const {PDFDocument,StandardFonts,rgb}=pdfLib;
  const pdf=await PDFDocument.load(bytes);
  const page=pdf.getPages()[def.strana], H=page.getHeight();
  const font=await pdf.embedFont(StandardFonts.Helvetica), form=pdf.getForm();
  const ink=rgb(.05,.1,.35), {PDFName}=pdfLib;
  // bez rámika a podkladu – okienka sú už predtlačené
  const cisty=f=>f.acroField.getWidgets().forEach(w=>w.dict.delete(PDFName.of('MK')));
  def.text.forEach(([n,x,y,w,h,o])=>{
    const f=form.createTextField(n);
    if(o.m)f.enableMultiline();
    f.addToPage(page,{x,y:H-y-h,width:w,height:h,font,textColor:ink,borderWidth:0,backgroundColor:undefined});
    f.setFontSize(o.m?9:8);
    if(o.c)f.setAlignment(pdfLib.TextAlignment.Center);
    cisty(f);
  });
  // Políčka kreslíme vlastným vzhľadom: bez bieleho podkladu (predtlačený štvorček ostane viditeľný)
  // a s fajkou z čiar, nie zo znaku písma – vyzerá rovnako v každom prehliadači PDF.
  form.updateFieldAppearances(font);
  const s=def.checkSize, k=s/7.2;
  const xobj=body=>pdf.context.register(pdf.context.stream(body,{Type:'XObject',Subtype:'Form',BBox:[0,0,s,s]}));
  const on=xobj(`q 0.05 0.1 0.35 RG ${1.3*k} w 1 J 1 j ${1.3*k} ${3.7*k} m ${3*k} ${1.6*k} l ${6.1*k} ${6.2*k} l S Q`), off=xobj('');
  def.check.forEach(([n,x,y])=>{
    const f=form.createCheckBox(n);
    f.addToPage(page,{x,y:H-y-s,width:s,height:s,borderWidth:0});
    cisty(f);
    f.acroField.getWidgets().forEach(w=>w.dict.set(PDFName.of('AP'),pdf.context.obj({N:{Yes:on,Off:off},D:{Yes:on,Off:off}})));
  });
  return await pdf.save({updateFieldAppearances:false});
}

// Zapíše hodnoty do PDF a vzhľad textových polí vykreslí vloženým písmom s diakritikou
// (štandardné písma PDF nemajú ľ, č, ť…). vals = {meno poľa: text | true/false}.
export async function zapisPdf(pdfLib,fontkit,bytes,fontBytes,vals){
  const {PDFDocument,PDFTextField,PDFCheckBox}=pdfLib;
  const pdf=await PDFDocument.load(bytes);
  pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(fontBytes,{subset:true});
  for(const f of pdf.getForm().getFields()){
    const n=f.getName();
    if(!(n in vals))continue;
    if(f instanceof PDFTextField){
      const max=f.getMaxLength(), t=String(vals[n]??'');
      f.setText(max!=null?t.slice(0,max):t);
      f.updateAppearances(font);
    }else if(f instanceof PDFCheckBox){
      if(vals[n])f.check();else f.uncheck();
    }
  }
  return await pdf.save({updateFieldAppearances:false});
}
