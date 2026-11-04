import React, { useState } from 'react';
import { CustomCommands } from '../../../../scripts/customcmdcommands';

const DevConsoleWindow: React.FC = () => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<string[]>(["PandaOS Kernel 1.0.4 - Developer Console", "Type 'help' for commands..."]);

    const handleCommand = (e: React.FormEvent) => {
        e.preventDefault();
        const cmd = input.toLowerCase().trim();
        let output = `> ${input}`;

        if (cmd === 'airbag off') CustomCommands.sendCommand('AIRBAG_OFF');
        else if (cmd === 'airbag on') CustomCommands.sendCommand('AIRBAG_ON');
        else if (cmd.startsWith('call ')) CustomCommands.sendCommand('MOCK_CALL', cmd.replace('call ', ''));
        else if (cmd === 'help') output += " | Available: airbag on/off, call [name], clear";
        else if (cmd === 'clear') { setHistory([]); setInput(''); return; }
        else output += " | Unknown command";

        setHistory([...history, output]);
        setInput('');
    };

    return (
        <div style={{ backgroundColor: '#000', color: '#0f0', height: '100vh', padding: '20px', fontFamily: 'monospace', overflowY: 'auto' }}>
            {history.map((line, i) => <div key={i} style={{ marginBottom: '5px' }}>{line}</div>)}
            <form onSubmit={handleCommand} style={{ display: 'flex', marginTop: '10px' }}>
                <span style={{ marginRight: '10px' }}>PandaOS:\&gt;</span>
                <input 
                    autoFocus
                    style={{ backgroundColor: 'transparent', color: '#0f0', border: 'none', outline: 'none', flex: 1, fontFamily: 'monospace', fontSize: '16px' }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
            </form>
        </div>
    );
};

export default DevConsoleWindow;