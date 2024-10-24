import React, { useState, useRef, useCallback, Suspense, useEffect } from 'react';

const ImageEditor = () => {
    const [palette, setPalette] = useState([]);
    const [originalImageData, setOriginalImageData] = useState(null);
    const [modifiedImageData, setModifiedImageData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [triggerColorChange, setTriggerColorChange] = useState(false);
    const [image, setImage] = useState(null);
    const [enableBgRemove, setEnableBgRemove] = useState(false);

    const canvasRef = useRef(null);
    const modifiedCanvasRef = useRef(null);
    const fileInputRef = useRef(null);

    const apiKey = "" // remove.bg api key

    const handleChangeBg = async (image) => {
        const url = "https://api.remove.bg/v1.0/removebg";
        const formData = new FormData();
        formData.append("image_file", image, image.name);
        formData.append("size", "auto");

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "X-Api-Key": apiKey
                },
                body: formData
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            return blob;
        } catch (err) {
            throw err;
        }
    };

    const handleImageUpload = async (event) => {
        const file = event.target.files[0];
        let processedFile = file;

        if (enableBgRemove) {
            try {
                setIsLoading(true);
                const bgRemoveBlob = await handleChangeBg(file);
                processedFile = new File([bgRemoveBlob], 'removed-bg.png', { type: 'image/png' });
            } catch (error) {
                console.error('Background removal failed:', error);
            } finally {
                setIsLoading(false);
            }
        }

        const image = new Image();
        const fileReader = new FileReader();

        fileReader.onload = () => {
            image.onload = () => {
                const canvas = canvasRef.current;
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                setOriginalImageData(imageData);
                setModifiedImageData(new ImageData(
                    new Uint8ClampedArray(imageData.data),
                    imageData.width,
                    imageData.height
                ));
                const colors = extractColors(imageData);
                buildPalette(colors);
                setTriggerColorChange(true);
                setIsLoading(true);
            };
            image.src = fileReader.result;
        };
        fileReader.readAsDataURL(processedFile);
    };

    const extractColors = (imageData) => {
        const colorMap = new Map();
        const samplingFactor = 20; // Sample every 20th pixel

        for (let i = 0; i < imageData.data.length; i += 4 * samplingFactor) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const colorKey = `${r},${g},${b}`;

            if (colorMap.has(colorKey)) {
                colorMap.set(colorKey, colorMap.get(colorKey) + 1);
            } else {
                colorMap.set(colorKey, 1);
            }
        }

        // Convert to array of color objects
        const colors = Array.from(colorMap.entries()).map(([key, count]) => {
            const [r, g, b] = key.split(',').map(Number);
            return { r, g, b, count };
        });

        return colors;
    };

    const buildPalette = (colors) => {
        // Group similar colors
        const groupedColors = groupSimilarColors(colors);

        // Sort groups by perceived brightness
        groupedColors.sort((a, b) => {
            const brightnessA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
            const brightnessB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
            return brightnessB - brightnessA;
        });

        // Limit to 8 colors (or adjust as needed)
        const limitedColors = groupedColors.slice(0, 6);

        const newPalette = limitedColors.map(color => ({
            original: rgbToHex(color),
            modified: rgbToHex(color)
        }));
        setPalette(newPalette);
    };

    const groupSimilarColors = (colors) => {
        const groups = [];
        const threshold = 100; // Increased threshold for more aggressive grouping

        for (const color of colors) {
            let addedToGroup = false;
            for (const group of groups) {
                if (isColorSimilar(color, group, threshold)) {
                    group.r = Math.round((group.r * group.count + color.r * color.count) / (group.count + color.count));
                    group.g = Math.round((group.g * group.count + color.g * color.count) / (group.count + color.count));
                    group.b = Math.round((group.b * group.count + color.b * color.count) / (group.count + color.count));
                    group.count += color.count;
                    addedToGroup = true;
                    break;
                }
            }
            if (!addedToGroup) {
                groups.push({ ...color });
            }
        }

        // Sort groups by count (frequency) and return top colors
        return groups.sort((a, b) => b.count - a.count);
    };

    const isColorSimilar = (color1, color2, threshold) => {
        const luminance1 = 0.299 * color1.r + 0.587 * color1.g + 0.114 * color1.b;
        const luminance2 = 0.299 * color2.r + 0.587 * color2.g + 0.114 * color2.b;

        // If both colors are very dark or very light, use a stricter threshold
        if ((luminance1 < 20 && luminance2 < 20) || (luminance1 > 235 && luminance2 > 235)) {
            return Math.abs(luminance1 - luminance2) < threshold / 2;
        }

        return colorDistance(color1, color2) < threshold;
    };

    const colorDistance = (color1, color2) => {
        const rDiff = color1.r - color2.r;
        const gDiff = color1.g - color2.g;
        const bDiff = color1.b - color2.b;
        return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    };

    const handleColorChange = (index, newColor) => {
        const updatedPalette = [...palette];
        updatedPalette[index].modified = newColor;
        setPalette(updatedPalette);
    };
    const applyColorChange = useCallback(() => {
        if (!originalImageData || !modifiedImageData) {
            return;
        }

        const canvas = modifiedCanvasRef.current;
        canvas.width = originalImageData.width;
        canvas.height = originalImageData.height;
        const ctx = canvas.getContext('2d');

        const newImageData = new ImageData(
            new Uint8ClampedArray(originalImageData.data),
            originalImageData.width,
            originalImageData.height
        );

        for (let i = 0; i < newImageData.data.length; i += 4) {
            const r = newImageData.data[i];
            const g = newImageData.data[i + 1];
            const b = newImageData.data[i + 2];
            const pixelColor = { r, g, b };

            let closestColorIndex = 0;
            let minDistance = Infinity;

            for (let j = 0; j < palette.length; j++) {
                const paletteColor = hexToRgb(palette[j].original);
                const distance = colorDistance(pixelColor, paletteColor);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestColorIndex = j;
                }
            }

            const newColor = hexToRgb(palette[closestColorIndex].modified);
            newImageData.data[i] = newColor.r;
            newImageData.data[i + 1] = newColor.g;
            newImageData.data[i + 2] = newColor.b;
        }

        setIsLoading(false);
        ctx.putImageData(newImageData, 0, 0);
        setModifiedImageData(newImageData);
        setImage(canvas.toDataURL());
    }, [originalImageData, modifiedImageData, palette]);


    const rgbToHex = (rgb) => {
        return "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1).toUpperCase();
    };

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    useEffect(() => {
        if (triggerColorChange) {
            const timer = setTimeout(() => {
                applyColorChange();
                setTriggerColorChange(false);
            }, 100); // Small delay to allow for re-render
            return () => clearTimeout(timer);
        }
    }, [triggerColorChange, applyColorChange]);

    const downloadImage = () => {
        const a = document.createElement('a');
        a.href = image;
        a.download = 'modified-image.png';
        a.click();
    }
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-6 text-center">Image Color Palette Editor & Background Remover</h1>

            <div className="mb-4">
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    ref={fileInputRef}
                    id="file-upload"
                    className="hidden"
                />
                <label
                    htmlFor="file-upload"
                    className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded inline-block"
                >
                    <div className='flex items-center gap-2'>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75" />
                        </svg>
                        Upload Image
                    </div>
                </label>
            </div>

            <label class="inline-flex mb-4 items-center me-5 cursor-pointer">
                <input type="checkbox" value="" class="sr-only peer" checked={enableBgRemove} onChange={() => setEnableBgRemove(!enableBgRemove)} />
                <div class="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-green-300 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                <span class="ms-3 text-sm font-medium text-gray-900">Enable Background Removal</span>
            </label>

            <div className="flex flex-wrap -mx-4">
                <div className="w-full md:w-1/2 px-4 mb-8">
                    <h2 className="text-xl font-semibold mb-4">Original Image</h2>
                    <div className='relative w-1/2'>
                        <canvas
                            ref={canvasRef}
                            className="w-full border border-gray-300 rounded" />
                        {!originalImageData && <div className='z-10 absolute top-0 left-0 w-full text-black h-full flex justify-center items-center'>
                            No Image Selected
                        </div>}
                    </div>
                </div>
                <div className="w-full md:w-1/2 px-4 mb-8">
                    <h2 className="text-xl font-semibold mb-4 ">Modified Image </h2>
                    <div className="relative w-1/2">
                        {isLoading && <div className="absolute top-0 left-0 w-full text-white bg-black/80 h-full flex justify-center items-center">
                            Loading...
                        </div>}
                        <canvas
                            ref={modifiedCanvasRef}
                            className="border w-full border-gray-300 rounded"
                        ></canvas>
                        {!modifiedImageData && <div className='z-10 absolute top-0 left-0 w-full text-black h-full flex justify-center items-center'>
                            No Image Selected
                        </div>}
                    </div>
                </div>
            </div>

            <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Color Palette</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-10 gap-4">
                    {palette.map((color, index) => (
                        <div key={index} className="flex flex-col items-center">
                            <div
                                className="w-14 h-14 rounded-full mb-2"
                                style={{ backgroundColor: color.original }}
                            ></div>
                            <input
                                type="color"
                                value={color.modified}
                                onChange={(e) => handleColorChange(index, e.target.value)}
                                onBlur={() => { setIsLoading(true); setTriggerColorChange(true) }}
                                className="w-14 h-8 cursor-pointer"
                            />
                            <span className="text-sm mt-1">{color.original}</span>
                        </div>
                    ))}
                </div>
            </div>

            <button
                onClick={downloadImage}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded flex items-center gap-2"
            >
                Download Image <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m-6 3.75 3 3m0 0 3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75" />
                </svg>

            </button>
        </div>
    );
};

export default ImageEditor;