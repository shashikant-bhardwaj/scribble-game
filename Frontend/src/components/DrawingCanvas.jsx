import { useRef, useState, useEffect } from "react";

export default function DrawingCanvas({ socket, isDrawer = false }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const historyRef = useRef([]);

  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(5);

  const getCanvasPosition = (event) => {
  const canvas = canvasRef.current;
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

  
const startDrawing = (event) => {
    if (!isDrawer) return;
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  const { x, y } = getCanvasPosition(event);

  isDrawing.current = true;
  canvas.setPointerCapture(event.pointerId);

  historyRef.current.push(
    ctx.getImageData(0, 0, canvas.width, canvas.height)
);
  ctx.beginPath();
  ctx.moveTo(x, y);
  socket?.emit("drawing:start", {
  x,
  y,
  color,
  brushSize,
});
};


 
const draw = (event) => {
    if (!isDrawer || !isDrawing.current) return;
  if (!isDrawing.current) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  const { x, y } = getCanvasPosition(event);

  ctx.lineTo(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  socket?.emit("drawing:move", {
  x,
  y,
  color,
  brushSize,
});
};


  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearCanvas = () => {
    if (!isDrawer) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [];

    socket?.emit("drawing:clear");
  };

  const undoDrawing = () => {
    if (!isDrawer) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx || historyRef.current.length === 0) {
        return;
    }

    const previousState = historyRef.current.pop();

    ctx.putImageData(previousState, 0, 0);

    socket?.emit("drawing:undo");
};

  
useEffect(() => {
  if (!socket) return;

  const getContext = () => canvasRef.current?.getContext("2d");

  const handleStart = ({ x, y, color, brushSize }) => {
    const ctx = getContext();
    if (!ctx) return;


    const canvas = canvasRef.current;

if (canvas) {
    historyRef.current.push(
        ctx.getImageData(0, 0, canvas.width, canvas.height)
    );
}
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const handleMove = ({ x, y, color, brushSize }) => {
    const ctx = getContext();
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx || historyRef.current.length === 0) {
        return;
    }

    const previousState = historyRef.current.pop();

    ctx.putImageData(previousState, 0, 0);
};

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = getContext();

    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
    }
  };

  socket.on("drawing:start", handleStart);
  socket.on("drawing:move", handleMove);
  socket.on("drawing:clear", handleClear);
  socket.on("drawing:undo", handleUndo);

  return () => {
    socket.off("drawing:start", handleStart);
    socket.off("drawing:move", handleMove);
    socket.off("drawing:clear", handleClear);
    socket.off("drawing:undo", handleUndo);
  };
}, [socket]);


  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#2d2b46] bg-[#11111f] p-3 shadow-2xl sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#29283e] pb-3">
        <label className="flex items-center gap-2 text-white">
          Color
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-white">
          Brush
          <input
            type="range"
            min="1"
            max="20"
            value={brushSize}
            onChange={(event) =>
              setBrushSize(Number(event.target.value))
            }
          />
          <span>{brushSize}px</span>
        </label>

        <button
          onClick={() => setColor("#ffffff")}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-white"
        >
          Eraser
        </button>

        <button
    onClick={undoDrawing}
    disabled={!isDrawer}
    className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
>
    ↶ Undo
</button>

        <button
          onClick={clearCanvas}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
        >
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={900}
        height={500}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        className="w-full rounded-xl bg-white"
        style={{ touchAction: "none", cursor: "crosshair" }}
      />
    </div>
  );
}
