// Light, Medium and SemiBold faces of common document families, each a
// family of its own ("Roboto Light"), so every path that picks a bundled face
// by family (canvas text, PDF export) uses them unchanged. A PDF line in such
// a weight falls back to its own family and weight (see fallbackFont). SIL OFL;
// converted from @fontsource WOFF (Latin and Latin Extended), see THIRD_PARTY.md.
// Source Sans 3 derivatives use the distinct Bide Sans 3 names (reserved name).
import w0 from './browser/fonts/weights/Roboto-Light.ttf';
import w1 from './browser/fonts/weights/Roboto-Medium.ttf';
import w2 from './browser/fonts/weights/Roboto-SemiBold.ttf';
import w3 from './browser/fonts/weights/Inter-Light.ttf';
import w4 from './browser/fonts/weights/Inter-Medium.ttf';
import w5 from './browser/fonts/weights/Inter-SemiBold.ttf';
import w6 from './browser/fonts/weights/OpenSans-Light.ttf';
import w7 from './browser/fonts/weights/OpenSans-Medium.ttf';
import w8 from './browser/fonts/weights/OpenSans-SemiBold.ttf';
import w9 from './browser/fonts/weights/Montserrat-Light.ttf';
import w10 from './browser/fonts/weights/Montserrat-Medium.ttf';
import w11 from './browser/fonts/weights/Montserrat-SemiBold.ttf';
import w12 from './browser/fonts/weights/Poppins-Light.ttf';
import w13 from './browser/fonts/weights/Poppins-Medium.ttf';
import w14 from './browser/fonts/weights/Poppins-SemiBold.ttf';
import w15 from './browser/fonts/weights/SourceSans3-Light.ttf';
import w16 from './browser/fonts/weights/SourceSans3-Medium.ttf';
import w17 from './browser/fonts/weights/SourceSans3-SemiBold.ttf';
import w18 from './browser/fonts/weights/NotoSans-Light.ttf';
import w19 from './browser/fonts/weights/NotoSans-Medium.ttf';
import w20 from './browser/fonts/weights/NotoSans-SemiBold.ttf';
export const weightFonts=[
{family:"Roboto Light",category:"sans",faces:[{style:"Regular",url:w0}]},
{family:"Roboto Medium",category:"sans",faces:[{style:"Regular",url:w1}]},
{family:"Roboto SemiBold",category:"sans",faces:[{style:"Regular",url:w2}]},
{family:"Inter Light",category:"sans",faces:[{style:"Regular",url:w3}]},
{family:"Inter Medium",category:"sans",faces:[{style:"Regular",url:w4}]},
{family:"Inter SemiBold",category:"sans",faces:[{style:"Regular",url:w5}]},
{family:"Open Sans Light",category:"sans",faces:[{style:"Regular",url:w6}]},
{family:"Open Sans Medium",category:"sans",faces:[{style:"Regular",url:w7}]},
{family:"Open Sans SemiBold",category:"sans",faces:[{style:"Regular",url:w8}]},
{family:"Montserrat Light",category:"sans",faces:[{style:"Regular",url:w9}]},
{family:"Montserrat Medium",category:"sans",faces:[{style:"Regular",url:w10}]},
{family:"Montserrat SemiBold",category:"sans",faces:[{style:"Regular",url:w11}]},
{family:"Poppins Light",category:"sans",faces:[{style:"Regular",url:w12}]},
{family:"Poppins Medium",category:"sans",faces:[{style:"Regular",url:w13}]},
{family:"Poppins SemiBold",category:"sans",faces:[{style:"Regular",url:w14}]},
{family:"Bide Sans 3 Light",category:"sans",faces:[{style:"Regular",url:w15}]},
{family:"Bide Sans 3 Medium",category:"sans",faces:[{style:"Regular",url:w16}]},
{family:"Bide Sans 3 SemiBold",category:"sans",faces:[{style:"Regular",url:w17}]},
{family:"Noto Sans Light",category:"sans",faces:[{style:"Regular",url:w18}]},
{family:"Noto Sans Medium",category:"sans",faces:[{style:"Regular",url:w19}]},
{family:"Noto Sans SemiBold",category:"sans",faces:[{style:"Regular",url:w20}]}
];
export const weightFamilies=new Set(weightFonts.map(f=>f.family));
