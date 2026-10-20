// Web stand-in for 'react-native/Libraries/Utilities/codegenNativeComponent'.
// react-native-svg's fabric barrel calls this at module load for every SVG
// element; the real RN file is Flow + native-bridge and cannot load in a
// browser. Map the component names to real SVG tags so the elements render,
// and degrade any other native view to a plain div.
import * as React from 'react';

const TAGS = {
  RNSVGCircle: 'circle',
  RNSVGClipPath: 'clipPath',
  RNSVGDefs: 'defs',
  RNSVGEllipse: 'ellipse',
  RNSVGFilter: 'filter',
  RNSVGFeBlend: 'feBlend',
  RNSVGFeColorMatrix: 'feColorMatrix',
  RNSVGFeComposite: 'feComposite',
  RNSVGFeFlood: 'feFlood',
  RNSVGFeGaussianBlur: 'feGaussianBlur',
  RNSVGFeMerge: 'feMerge',
  RNSVGFeOffset: 'feOffset',
  RNSVGForeignObject: 'foreignObject',
  RNSVGGroup: 'g',
  RNSVGImage: 'image',
  RNSVGLine: 'line',
  RNSVGLinearGradient: 'linearGradient',
  RNSVGMarker: 'marker',
  RNSVGMask: 'mask',
  RNSVGPath: 'path',
  RNSVGPattern: 'pattern',
  RNSVGRadialGradient: 'radialGradient',
  RNSVGRect: 'rect',
  RNSVGSvgAndroid: 'svg',
  RNSVGSvgIOS: 'svg',
  RNSVGSymbol: 'symbol',
  RNSVGText: 'text',
  RNSVGTextPath: 'textPath',
  RNSVGTSpan: 'tspan',
  RNSVGUse: 'use',
};

export default function codegenNativeComponent(componentName) {
  const tag = TAGS[componentName] ?? 'div';
  const Component = React.forwardRef((props, ref) =>
    React.createElement(tag, { ...props, ref }),
  );
  Component.displayName = componentName;
  return Component;
}
