'use client';

import React, { RefObject, useEffect, useState } from 'react';
import { Card, Button, Slider, Space, Progress, Radio, Tooltip, Divider, theme, Alert } from 'antd';
import {
  BorderOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  QuestionCircleOutlined,
  LoadingOutlined
} from '@ant-design/icons';
import { useCanvasInitialization } from '../hooks/useCanvasInitialization';
import { useDrawingHandlers } from '../hooks/useDrawingHandlers';
import { useAnnotation } from '../context/annotation-context';
import { TOOLS } from '../utils/constants';
import { applyMagicBrush, applyMagicBrushToArea } from '@/utils/image-processing';
import { useDocument } from '@/context/document-context';
import '@ant-design/v5-patch-for-react-19';

// UI Component for the toolbar
function ToolbarSection({
  context,
  canvasRef,
}: {
  context: CanvasRenderingContext2D | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const { handleSaveAnnotation } = useDocument();

  const {
    tool,
    isErasing,
    brushSize,
    annotatedAreas,
    handleToolChange,
    handleEraseToggle,
    setBrushSize,
  } = useAnnotation();

  const handleSave = () => {
    if (!canvasRef.current) return;
    const imageData = canvasRef.current.toDataURL('image/png');
    handleSaveAnnotation(imageData, annotatedAreas);
  };

  return (
    <div
      className="flex flex-col rounded-lg w-full gap-5 p-5 border border-gray-300 mb-3"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex-1">
          <Radio.Group
            value={isErasing ? 'erase' : tool}
            onChange={(e) => {
              if (e.target.value === 'erase') {
                handleEraseToggle();
              } else {
                handleToolChange(e.target.value);
              }
            }}
            buttonStyle="solid"
            size="middle"
            className="flex flex-wrap gap-1"
          >
            <Tooltip title="Select an area to auto-apply Magic Brush">
              <Radio.Button value={TOOLS.AREA_MAGIC_BRUSH} className="flex items-center">
                <BorderOutlined /> <span className="hidden sm:inline ml-1">Area Magic</span>
              </Radio.Button>
            </Tooltip>
            <Tooltip title="Draw freely on the page">
              <Radio.Button value={TOOLS.PEN} className="flex items-center">
                <EditOutlined /> <span className="hidden sm:inline ml-1">Pen</span>
              </Radio.Button>
            </Tooltip>
            <Tooltip title={isErasing ? "Stop erasing" : "Erase annotations"}>
              <Radio.Button value="erase" className="flex items-center">
                <DeleteOutlined /> <span className="hidden sm:inline ml-1">{isErasing ? "Stop" : "Erase"}</span>
              </Radio.Button>
            </Tooltip>
          </Radio.Group>

          <Tooltip title="Help with tools" placement="right">
            <Button
              type="text"
              shape="circle"
              icon={<QuestionCircleOutlined />}
              size="small"
              className="ml-2"
            />
          </Tooltip>
        </div>

        <div className="flex flex-1 items-center">
          <span className="mr-2 whitespace-nowrap">Brush Size:</span>
          <Slider
            min={5}
            max={50}
            value={brushSize}
            onChange={setBrushSize}
            className="w-full max-w-56 mr-4"
            tooltip={{ formatter: (value) => `${value}px` }}
          />
          <span className="text-right w-12">{brushSize}px</span>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          className="w-full md:w-auto"
        >
          Save
        </Button>
      </div>
      <ProcessingIndicator />
    </div>
  );
}

// UI Component for processing indicator
function ProcessingIndicator() {
  const { token } = theme.useToken();
  const { isProcessingArea, processingProgress } = useAnnotation();

  if (isProcessingArea) {
    return (
      <Card className="mb-4 border-0 shadow-md rounded-lg bg-blue-50">
        <Progress
          percent={Math.round(processingProgress)}
          status="active"
          format={percent => `Processing... ${percent}%`}
          strokeColor={token.colorPrimary}
          trailColor="#e6f4ff"
        />
      </Card>
    );
  }

  return (
    <>
     <Alert
      message="NOTE: Changes are not saved until you click the Save!!" 
      type="warning"
      closable
    />
    </>
  );
}

export default function AnnotationCanvas() {
  const { token } = theme.useToken();
  const { state, handleSaveAnnotation } = useDocument();
  const { canvasRef, context } = useCanvasInitialization(
    state.annotatedImages[state.currentPageIndex]?.imageData ||
    state.imageUrls[state.currentPageIndex]
  );
  
  const {
    brushSize,
    areaStart,
    areaEnd,
    isProcessingArea,
    tempImageData,
    originalImageData,
    setTempImageData,
    setOriginalImageData,
    tool
  } = useAnnotation();

  // Use the drawing handlers hook
  const { startDrawing, draw, stopDrawing } = useDrawingHandlers(
    context as CanvasRenderingContext2D,
    canvasRef.current as HTMLCanvasElement
  );

  // Store original image data when canvas is initialized
  useEffect(() => {
    if (context && canvasRef.current && !originalImageData) {
      const imgData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      setOriginalImageData(imgData);
    }
  }, [context, canvasRef, originalImageData, setOriginalImageData]);

  // Effect to draw selection rectangle when area changes
  useEffect(() => {
    if (!context || !areaStart || !areaEnd) return;

    // Save the current image state if we haven't already
    if (!tempImageData && canvasRef.current) {
      const imgData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      setTempImageData(imgData);
    } else if (tempImageData) {
      // Restore the original image state
      context.putImageData(tempImageData, 0, 0);
    }

    // Draw selection rectangle
    context.save();
    context.strokeStyle = token.colorPrimary;
    context.lineWidth = 2;
    context.setLineDash([5, 5]);

    const x = Math.min(areaStart.x, areaEnd.x);
    const y = Math.min(areaStart.y, areaEnd.y);
    const width = Math.abs(areaEnd.x - areaStart.x);
    const height = Math.abs(areaEnd.y - areaStart.y);

    context.strokeRect(x, y, width, height);

    // Add a semi-transparent overlay
    context.fillStyle = 'rgba(24, 144, 255, 0.1)';
    context.fillRect(x, y, width, height);

    context.restore();
  }, [context, tempImageData, areaStart, areaEnd, setTempImageData, canvasRef, token.colorPrimary]);

  // Get a cursor based on the current tool
  const getCursor = () => {
    if (isProcessingArea) return 'wait';
    if (tool === TOOLS.AREA_MAGIC_BRUSH) return 'crosshair';
    if (tool === TOOLS.PEN) return `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="${brushSize}" height="${brushSize}" viewBox="0 0 ${brushSize} ${brushSize}"><circle cx="${brushSize / 2}" cy="${brushSize / 2}" r="${brushSize / 2 - 1}" fill="rgba(24, 144, 255, 0.3)" stroke="%231890ff" stroke-width="1"/></svg>') ${brushSize / 2} ${brushSize / 2}, auto`;
    return 'default';
  };

  return (
    <div className="flex flex-col items-center">
      <ToolbarSection context={context} canvasRef={canvasRef} />

      <div
        className="border border-gray-300 overflow-auto max-h-screen rounded-md bg-gray-100 shadow-inner"
        style={{ maxHeight: 'calc(100vh - 300px)' }}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="max-w-full"
            style={{
              cursor: getCursor(),
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
            }}
          />
          {isProcessingArea && (
            <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center">
              <div className="text-center p-4 bg-white rounded-lg shadow-lg">
                <LoadingOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
                <p className="mt-2">Processing area...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="w-full mt-4 text-center">
        {tool === TOOLS.AREA_MAGIC_BRUSH ? (
          <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
            <p className="font-medium">Click and drag to select an area. Magic Brush will apply automatically.</p>
          </div>
        ) : tool === TOOLS.PEN ? (
          <p>Click and drag to draw with the Pen tool</p>
        ) : (
          <p>Click on annotations to erase them</p>
        )}
      </div>
    </div>
  );
}