
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HistoryItem, HistoryItemType } from './types';
import * as geminiService from './services/geminiService';
import { Chat } from '@google/genai';

const HELP_MESSAGE = `
Gemini API Terminal Explorer. Available commands:
- help: Show this help message.
- clear: Clear the terminal screen.
- text <prompt>: Generate text from a prompt.
- stream <prompt>: Stream a text response.
- chat <message>: Start or continue a chat. Use 'chat-reset' to start over.
- chat-reset: End the current chat session.
- json: Get a structured JSON response (cookie recipes).
- function-call <prompt>: Demonstrate function calling (e.g., 'dim the lights to 50% and make them warm white').
- search <query>: Answer a question using Google Search grounding.
- maps <query>: Answer a location-based question using Google Maps grounding.
- describe: Describe an image you upload.
- image <prompt>: Generate an image.
- video <prompt>: Generate a video (may take several minutes).
`;

const WELCOME_MESSAGE: HistoryItem = {
  id: 0,
  type: 'system',
  content: `Welcome to the Gemini API Terminal Explorer. Type 'help' for a list of commands.`,
};

const CommandOutput: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const getPrefix = (type: HistoryItemType) => {
    switch (type) {
      case 'command': return <span className="text-cyan-400 mr-2">{'>'}</span>;
      case 'system': return <span className="text-yellow-400 mr-2">{'SYSTEM:'}</span>;
      case 'error': return <span className="text-red-500 mr-2">{'ERROR:'}</span>;
      default: return null;
    }
  };

  const renderContent = () => {
    if (typeof item.content === 'string') {
      // Handle special content types (images, videos, links)
      if (item.content.startsWith('data:image')) {
        return <img src={item.content} alt="Generated" className="max-w-xs md:max-w-sm my-2 rounded-lg" />;
      }
      if (item.content.startsWith('https://')) {
          if(item.content.includes("generativelanguage.googleapis.com")) {
            return (
                <div className="my-2">
                    <p className="text-green-400">Video generated successfully. Playing preview:</p>
                    <video controls src={item.content} className="max-w-xs md:max-w-sm my-2 rounded-lg" />
                </div>
            );
          }
        return <a href={item.content} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{item.content}</a>;
      }
      return <pre className="whitespace-pre-wrap break-words">{item.content}</pre>;
    }
    return item.content;
  };

  return (
    <div className="flex items-start">
      {getPrefix(item.type)}
      <div className="flex-1">{renderContent()}</div>
    </div>
  );
};


const App: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatInstanceRef = useRef<Chat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  
  const [pendingFileCommand, setPendingFileCommand] = useState<{ command: string, prompt: string } | null>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const addHistoryItem = useCallback((type: HistoryItemType, content: React.ReactNode) => {
    setHistory(prev => [...prev, { type, content, id: prev.length }]);
  }, []);
  
  const updateLastHistoryItem = useCallback((updater: (prevContent: React.ReactNode) => React.ReactNode) => {
    setHistory(prev => {
        const newHistory = [...prev];
        const lastItem = newHistory[newHistory.length - 1];
        if (lastItem) {
            lastItem.content = updater(lastItem.content);
        }
        return newHistory;
    });
  }, []);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && pendingFileCommand) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        setIsLoading(true);
        addHistoryItem('system', `Describing image: ${file.name}...`);
        try {
          const description = await geminiService.describeImage(pendingFileCommand.prompt, base64String, file.type);
          addHistoryItem('output', description);
        } catch (error) {
          addHistoryItem('error', error instanceof Error ? error.message : 'An unknown error occurred.');
        } finally {
          setIsLoading(false);
          setPendingFileCommand(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };
  
  const executeCommand = async (commandLine: string) => {
    const [command, ...args] = commandLine.trim().split(' ');
    const prompt = args.join(' ');
    
    addHistoryItem('command', commandLine);
    setIsLoading(true);

    try {
      switch (command.toLowerCase()) {
        case 'help':
          addHistoryItem('system', HELP_MESSAGE);
          break;
        case 'clear':
          setHistory([WELCOME_MESSAGE]);
          break;
        case 'text':
          if (!prompt) throw new Error("Usage: text <prompt>");
          const textResponse = await geminiService.generateText(prompt);
          addHistoryItem('output', textResponse);
          break;
        case 'stream':
           if (!prompt) throw new Error("Usage: stream <prompt>");
           addHistoryItem('output', ''); // Add empty item to update
           await geminiService.generateTextStream(prompt, (chunk) => {
               updateLastHistoryItem(prev => (prev as string) + chunk);
           });
          break;
        case 'chat':
          if (!prompt) throw new Error("Usage: chat <message>");
          if (!chatInstanceRef.current) {
            chatInstanceRef.current = geminiService.startChat();
            addHistoryItem('system', 'New chat session started.');
          }
          const chatResponse = await geminiService.continueChat(chatInstanceRef.current, prompt);
          addHistoryItem('output', chatResponse);
          break;
        case 'chat-reset':
          chatInstanceRef.current = null;
          addHistoryItem('system', 'Chat session reset.');
          break;
        case 'json':
            addHistoryItem('system', 'Requesting JSON response...');
            const jsonResponse = await geminiService.getJsonRecipes();
            addHistoryItem('output', <pre className="whitespace-pre-wrap break-words bg-gray-800 p-2 rounded">{jsonResponse}</pre>);
            break;
        case 'function-call':
            if (!prompt) throw new Error("Usage: function-call <prompt>");
            const funcResponse = await geminiService.demonstrateFunctionCalling(prompt);
            addHistoryItem('output', funcResponse);
            break;
        case 'search':
            if (!prompt) throw new Error("Usage: search <query>");
            const { text: searchResult, sources: searchSources } = await geminiService.searchWithGoogle(prompt);
            addHistoryItem('output', <>
                {searchResult}
                {searchSources.length > 0 && <div className="mt-4">
                    <h4 className="text-green-400 font-bold">Sources:</h4>
                    <ul className="list-disc list-inside">
                        {searchSources.map((source, i) => (
                            <li key={i}><a href={source.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{source.web.title}</a></li>
                        ))}
                    </ul>
                </div>}
            </>);
            break;
        case 'maps':
            if (!prompt) throw new Error("Usage: maps <query>");
            addHistoryItem('system', 'Requesting geolocation...');
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                addHistoryItem('system', `Location found: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
                const { text: mapsResult, sources: mapsSources } = await geminiService.searchWithMaps(prompt, { latitude, longitude });
                addHistoryItem('output', <>
                    {mapsResult}
                    {mapsSources.length > 0 && <div className="mt-4">
                        <h4 className="text-green-400 font-bold">Places Mentioned:</h4>
                        <ul className="list-disc list-inside">
                            {mapsSources.map((source, i) => (
                               <li key={i}><a href={source.maps.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">{source.maps.title}</a></li>
                            ))}
                        </ul>
                    </div>}
                </>);
                setIsLoading(false);
            }, (error) => {
                addHistoryItem('error', `Geolocation failed: ${error.message}`);
                setIsLoading(false);
            });
            return; // Don't set isLoading to false here, it's handled in the callback
        case 'describe':
            setPendingFileCommand({ command: 'describe', prompt: prompt || 'What is in this image?' });
            fileInputRef.current?.click();
            addHistoryItem('system', 'Please select an image file to describe.');
            // isLoading will be handled in the file change handler
            return;
        case 'image':
            if (!prompt) throw new Error("Usage: image <prompt>");
            const base64Image = await geminiService.generateImage(prompt);
            addHistoryItem('output', `data:image/jpeg;base64,${base64Image}`);
            break;
        case 'video':
            if (!prompt) throw new Error("Usage: video <prompt>");
            addHistoryItem('system', "Starting video generation... This can take several minutes. Polling for status every 10 seconds.");
            const videoUrl = await geminiService.generateVideo(prompt);
            addHistoryItem('output', videoUrl);
            break;
        default:
          addHistoryItem('error', `Command not found: ${command}. Type 'help' for a list of commands.`);
      }
    } catch (error) {
        if (error instanceof Error) {
            addHistoryItem('error', error.message);
            if (error.message.includes("select a valid key")) {
                 // specific handling for Veo key error
                 addHistoryItem('system', "Please try the 'video' command again to re-trigger API key selection.");
            }
        } else {
            addHistoryItem('error', 'An unknown error occurred.');
        }
    } finally {
        if (command !== 'maps' && command !== 'describe') {
          setIsLoading(false);
        }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      executeCommand(input);
      setInput('');
    }
  };

  return (
    <div className="bg-gray-900 text-gray-200 font-mono h-screen flex flex-col p-4">
      <div className="flex-1 overflow-y-auto pr-2 space-y-2">
        {history.map(item => <CommandOutput key={item.id} item={item} />)}
        {isLoading && <div className="flex items-center"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-400 mr-2"></div>Processing...</div>}
        <div ref={terminalEndRef} />
      </div>
      <div className="mt-4 flex items-center">
        <span className="text-cyan-400 mr-2">{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none text-gray-200 w-full focus:outline-none"
          placeholder="Type a command and press Enter..."
          disabled={isLoading}
          autoFocus
        />
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
        />
      </div>
    </div>
  );
};

export default App;
