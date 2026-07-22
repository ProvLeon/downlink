"use client";

import { useState, useRef } from "react";
import { soundManager } from "../lib/SoundManager";
import gsap from "gsap";
import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { useGSAP } from "@gsap/react";

interface SplashScreenProps {
  onComplete?: () => void;
  minimumDuration?: number;
}

export function SplashScreen({ onComplete, minimumDuration = 2500 }: SplashScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoGroupRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  
  // SVG parts for the actual downlink.svg
  const p1 = useRef<SVGPathElement>(null);
  const p2 = useRef<SVGPathElement>(null);
  const p3 = useRef<SVGPathElement>(null); // This is the main body
  const p4 = useRef<SVGPathElement>(null);
  const p5 = useRef<SVGPathElement>(null);
  const p6 = useRef<SVGPathElement>(null);

  const [gone, setGone] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  useGSAP(() => {
    const win = getCurrentWindow();
    
    // Force background to be fully transparent on HTML during splash
    document.documentElement.style.setProperty("--background", "transparent");

    // Show the window now that React is hydrated
    win.show().catch((e) => console.error("Failed to show window:", e));

    if (audioRef.current) {
      audioRef.current.volume = 0.6;
      audioRef.current.play().catch(e => console.warn("Autoplay blocked:", e));
    }

    const tl = gsap.timeline({
      onComplete: async () => {
        // Remove override to allow globals.css to handle background
        document.documentElement.style.removeProperty("--background");
        
        try {
          // Show the main window
          const mainWindow = await Window.getByLabel("main");
          if (mainWindow) {
            await mainWindow.show();
          }
          
          if (onComplete) onComplete();
          
          // Close the splash window
          await win.close();
        } catch (error) {
          console.error("Failed to transition to main window:", error);
          if (onComplete) onComplete();
          setGone(true);
        }
      }
    });

    const parts = [p1.current, p2.current, p4.current, p5.current, p6.current, p3.current]; // Animate main body last or together

    // Initial setup
    gsap.set(logoGroupRef.current, { scale: 0.5, opacity: 0, y: 20 });
    gsap.set(textRef.current, { y: 20, opacity: 0, filter: "blur(10px)" });
    gsap.set(glowRef.current, { scale: 0.2, opacity: 0 });
    gsap.set(parts, { scale: 0, opacity: 0, transformOrigin: "center center" });

    tl
    .to(logoGroupRef.current, {
      scale: 1,
      opacity: 1,
      y: 0,
      duration: 1.0,
      ease: "power3.out"
    })
    .to(glowRef.current, {
      scale: 1,
      opacity: 0.6,
      duration: 1.5,
      ease: "power2.out"
    }, "-=0.8")
    // Stagger in the individual parts of the actual logo!
    .to(parts, {
      scale: 1,
      opacity: 1,
      duration: 0.8,
      stagger: 0.1,
      ease: "back.out(1.5)"
    }, "-=1.0")
    .to(textRef.current, {
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      duration: 0.8,
      ease: "power2.out"
    }, "-=0.5")
    
    // Hold
    .to({}, { duration: Math.max(0.5, (minimumDuration - 2500) / 1000) })

    // Exit animation
    .to(logoGroupRef.current, {
      scale: 1.1,
      opacity: 0,
      duration: 0.4,
      ease: "power2.in"
    })
    .to([textRef.current, glowRef.current], {
      opacity: 0,
      duration: 0.3,
      ease: "power2.in"
    }, "-=0.2")
    .to(containerRef.current, {
      opacity: 0,
      duration: 0.3,
      ease: "power2.in"
    });

  }, []);

  if (gone) return null;

  return (
    <>
      <audio ref={audioRef} src="/sounds/splashscreen-sound.mp3" preload="auto" />
      <div
        ref={containerRef}
        className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-transparent pointer-events-none"
      >
        <div className="relative flex flex-col items-center justify-center pointer-events-auto">
          
          {/* Deep glowing background */}
          <div 
            ref={glowRef}
            className="absolute top-1/2 left-1/2 h-[350px] w-[350px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,_rgba(6,182,212,0.3)_0%,_rgba(59,130,246,0.1)_50%,_transparent_100%)] pointer-events-none"
            style={{ mixBlendMode: "screen" }}
          />

          {/* Authentic Embossed SVG Logo */}
          <div 
            ref={logoGroupRef} 
            className="relative z-10 flex items-center justify-center"
            style={{
              filter: "drop-shadow(0px 20px 30px rgba(0,0,0,0.5)) drop-shadow(0px 0px 15px rgba(6,182,212,0.4))",
            }}
          >
            <svg
              width="140"
              height="140"
              viewBox="0 0 1583 1583"
              fill="url(#fillGradient)"
              className="overflow-visible"
            >
              <defs>
                <linearGradient id="fillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <path ref={p1} d="M 255.500 288.337 C 243.334 291.415, 233.749 299.188, 228.428 310.291 C 225.380 316.651, 225 318.357, 225 325.685 C 225 342.335, 228.783 347.717, 269.498 389 C 286.584 406.325, 309.992 430.175, 321.514 442 C 355.571 476.952, 361.658 482.065, 372.938 485.193 C 380.969 487.419, 384.749 487.453, 393.931 485.379 C 402.797 483.377, 411.110 477.621, 415.887 470.176 C 420.248 463.381, 423.953 452.639, 423.979 446.718 C 424.010 439.567, 419.061 427.775, 412.657 419.741 C 409.694 416.023, 381.283 386.657, 349.522 354.483 C 291.992 296.206, 291.741 295.969, 283.236 291.754 C 275.922 288.130, 273.681 287.491, 267.599 287.298 C 263.695 287.173, 258.250 287.641, 255.500 288.337" />
              <path ref={p2} d="M 699 311.865 C 682.447 318.380, 672.294 332.768, 671.806 350.403 C 671.576 358.710, 673.502 364.705, 679.064 373 C 688.381 386.894, 713.746 413.230, 723.170 418.797 C 738.289 427.727, 759.386 423.992, 772.239 410.108 C 780.425 401.266, 782.294 396.625, 782.795 383.884 C 783.451 367.192, 781.469 363.995, 751.821 333.906 C 734.739 316.570, 733.043 315.133, 726.739 312.656 C 718.383 309.373, 706.213 309.026, 699 311.865" />
              <path ref={p3} d="M 497.497 320.737 C 489.611 323.556, 480.876 330.248, 477.258 336.244 C 470.473 347.486, 469.497 350.674, 469.532 361.500 C 469.561 370.505, 469.847 372.047, 472.413 377 C 477.024 385.902, 481.341 390.695, 518.350 428 C 573.792 483.883, 609.533 520.460, 621.936 534.008 C 628.226 540.879, 648.476 561.815, 666.936 580.533 C 685.396 599.252, 709.251 623.777, 719.947 635.033 C 730.642 646.290, 752.251 668.550, 767.966 684.500 C 827.878 745.309, 832.604 751.288, 832.357 765.963 C 832.206 774.957, 830.250 780.769, 825.366 786.729 C 820.570 792.581, 815.243 795.970, 808.254 797.615 C 800.241 799.500, 794.959 799.331, 788.696 796.987 C 778.106 793.025, 782.533 797.313, 670.477 682.469 C 649.565 661.036, 620.220 630.900, 605.267 615.500 C 590.313 600.100, 561.749 571.013, 541.789 550.862 C 499.679 508.347, 501.484 509.625, 483.500 509.545 C 474.675 509.505, 472.824 509.817, 467.747 512.196 C 446.885 521.973, 437.208 547.761, 446.965 567.580 C 448.763 571.232, 452.988 577.433, 456.353 581.360 C 462.583 588.628, 493.649 621.202, 527.061 655.500 C 537.241 665.950, 548.044 677.200, 551.068 680.500 C 567.083 697.977, 590.628 722.743, 608.114 740.504 C 631.382 764.139, 633.108 766.908, 633.353 781 C 633.477 788.191, 633.129 790.226, 631.091 794.213 C 622.506 811.011, 601.207 818.268, 584.903 809.950 C 582.336 808.641, 567.082 794.111, 544.635 771.596 C 501.762 728.591, 503.039 729.500, 485.500 729.500 C 475.204 729.500, 474.069 729.704, 467.759 732.693 C 451.918 740.197, 443.363 754.867, 444.144 773.189 C 444.714 786.579, 447.724 791.588, 467.375 811.845 C 476.261 821.005, 494.078 839.525, 506.969 853 C 519.860 866.475, 543.703 890.893, 559.953 907.262 C 576.204 923.630, 598.950 946.785, 610.500 958.717 C 622.050 970.649, 641.959 991.007, 654.742 1003.956 C 667.525 1016.905, 677.987 1028.217, 677.992 1029.094 C 678 1030.693, 620.830 1087.917, 605.153 1102.001 C 585.562 1119.603, 576.458 1135.798, 573.884 1157.625 C 570.612 1185.363, 580.512 1209.988, 601.946 1227.426 C 616.439 1239.217, 628.476 1242.689, 664.500 1245.470 C 672.598 1246.096, 699.191 1249.019, 737.500 1253.496 C 764.226 1256.619, 784.455 1258.789, 794 1259.557 C 798.125 1259.889, 813.425 1261.495, 828 1263.125 C 842.575 1264.756, 859 1266.524, 864.500 1267.053 C 870 1267.582, 881.700 1268.898, 890.500 1269.977 C 899.300 1271.057, 916.625 1272.874, 929 1274.017 C 956.448 1276.552, 985.002 1279.488, 1007 1282.036 C 1016.075 1283.087, 1027.325 1284.219, 1032 1284.552 C 1036.675 1284.885, 1051.525 1286.458, 1065 1288.047 C 1078.475 1289.637, 1094.675 1291.423, 1101 1292.018 C 1114.657 1293.301, 1142.093 1296.281, 1165 1298.969 C 1174.075 1300.034, 1188.025 1301.374, 1196 1301.946 C 1203.975 1302.518, 1215.675 1303.677, 1222 1304.522 C 1240.053 1306.934, 1248.936 1307.342, 1257.532 1306.152 C 1281.668 1302.811, 1305.134 1286.054, 1315.376 1264.845 C 1321.918 1251.296, 1324.002 1241.982, 1323.992 1226.333 C 1323.988 1219.275, 1323.547 1210.800, 1323.011 1207.500 C 1322.083 1201.777, 1320.355 1183.795, 1318.014 1155.500 C 1317.422 1148.350, 1316.042 1131.700, 1314.946 1118.500 C 1313.850 1105.300, 1312.076 1086.625, 1311.004 1077 C 1309.931 1067.375, 1308.593 1052.360, 1308.030 1043.633 C 1307.466 1034.907, 1306.349 1022.082, 1305.547 1015.133 C 1303.956 1001.349, 1301.407 972.276, 1299.924 951 C 1299.407 943.575, 1298.544 934.350, 1298.007 930.500 C 1297.469 926.650, 1296.551 917.650, 1295.965 910.500 C 1295.380 903.350, 1294.469 894.575, 1293.941 891 C 1293.413 887.425, 1292.543 876.850, 1292.006 867.500 C 1291.469 858.150, 1290.356 844.875, 1289.531 838 C 1287.677 822.540, 1285.333 796.571, 1283.516 771.345 C 1282.757 760.810, 1281.659 747.760, 1281.075 742.345 C 1278.156 715.249, 1275.917 690.877, 1274.982 676 C 1274.411 666.925, 1273.308 652.750, 1272.532 644.500 C 1271.755 636.250, 1270.824 625.450, 1270.464 620.500 C 1269.606 608.727, 1265.918 593.762, 1261.921 585.837 C 1254.477 571.077, 1241.249 557.849, 1227.514 551.431 C 1214.235 545.225, 1211.318 544.612, 1195 544.599 C 1181.559 544.588, 1179.952 544.791, 1173 547.385 C 1159.527 552.411, 1152.791 557.308, 1132.022 577.176 C 1121.285 587.447, 1101.040 607.360, 1087.032 621.426 C 1073.025 635.491, 1061.100 646.997, 1060.532 646.993 C 1059.965 646.989, 1058.397 645.302, 1057.049 643.243 C 1055.700 641.184, 1043.550 628.474, 1030.049 614.998 C 1001.781 586.784, 954.180 538.454, 906 489.049 C 887.575 470.155, 870.250 453.003, 867.500 450.932 C 860.982 446.025, 851.572 442.905, 843.045 442.825 C 834.498 442.745, 830.868 443.561, 823.668 447.180 C 815.907 451.081, 810.034 457.154, 805.899 465.554 C 802.653 472.147, 802.501 472.955, 802.512 483.479 C 802.520 490.032, 803.062 496.033, 803.851 498.282 C 805.914 504.170, 815.407 516.148, 830.709 532.174 C 848.504 550.810, 850.159 553.529, 850.288 564.341 C 850.474 580.015, 844.823 590.096, 832.808 595.525 C 827.431 597.955, 825.172 598.385, 817.500 598.438 C 802.304 598.543, 801.816 598.197, 767.101 562.745 C 750.820 546.119, 706.225 500.773, 668 461.977 C 629.775 423.182, 584.229 376.919, 566.786 359.171 C 536.210 328.061, 534.793 326.773, 527.286 323.274 C 520.642 320.177, 518.253 319.594, 511 319.297 C 504.666 319.038, 501.225 319.405, 497.497 320.737" />
              <path ref={p4} d="M 329.764 576.086 C 327.159 576.495, 321.876 578.283, 318.023 580.059 C 298.213 589.190, 288.744 613.656, 297.564 632.921 C 300.825 640.044, 304.330 644.247, 323.478 664 C 357.345 698.936, 361.204 702.585, 368 706.094 C 374.205 709.298, 374.999 709.452, 385.500 709.475 C 395.666 709.498, 396.955 709.277, 402.500 706.564 C 409.747 703.018, 418.859 694.199, 422.254 687.446 C 425.927 680.140, 427.321 670.548, 425.915 662.250 C 424.029 651.120, 420.178 645.185, 404.016 628.500 C 396.025 620.250, 384.350 608.100, 378.072 601.500 C 362.627 585.262, 356.559 580.506, 348.201 578.092 C 339.578 575.601, 335.603 575.168, 329.764 576.086" />
              <path ref={p5} d="M 900 627.406 C 886.532 631.209, 878.981 639.781, 876.460 654.130 C 875.670 658.626, 878.155 668.773, 881.364 674.154 C 882.657 676.322, 900.316 694.864, 920.607 715.358 C 940.898 735.853, 970.042 765.705, 985.370 781.698 C 1020.452 818.299, 1024.225 820.779, 1040.771 818.114 C 1051.563 816.376, 1059.740 808.645, 1063.925 796.222 C 1067.335 786.099, 1066.347 778.637, 1060.413 769.698 C 1058.880 767.389, 1044.979 752.675, 1029.521 737 C 1014.063 721.325, 985.685 692.358, 966.458 672.630 C 947.231 652.901, 929.510 635.229, 927.077 633.357 C 919.987 627.904, 907.756 625.216, 900 627.406" />
              <path ref={p6} d="M 685 842.873 C 667.637 848.605, 658.457 865.621, 663.955 881.887 C 665.142 885.399, 667.660 890.691, 669.551 893.647 C 671.442 896.603, 685.029 911.282, 699.744 926.268 C 714.460 941.255, 729.866 957.112, 733.979 961.508 C 759.143 988.397, 792.149 1021.141, 797.721 1024.742 C 805.599 1029.833, 815.068 1032.507, 822.218 1031.661 C 829.141 1030.841, 839.320 1025.758, 842.569 1021.499 C 851.275 1010.084, 850.972 993.712, 841.829 981.519 C 839.998 979.078, 816.410 954.450, 789.412 926.790 C 706.912 842.269, 714.269 849.450, 706.630 845.986 C 699.491 842.749, 689.661 841.334, 685 842.873" />
            </svg>
          </div>

          {/* Branding text */}
          <div ref={textRef} className="mt-10 flex flex-col items-center gap-2 z-20">
            <h1 className="text-3xl tracking-wider text-white" style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontWeight: 300 }}>
              Downlink
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex h-1.5 w-1.5 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" style={{ animationDuration: '2s' }} />
                <span className="relative inline-flex h-1 w-1 rounded-full bg-cyan-500" />
              </div>
              <p className="text-[11px] tracking-[0.25em] text-cyan-400/80 uppercase font-medium">
                Initializing
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
