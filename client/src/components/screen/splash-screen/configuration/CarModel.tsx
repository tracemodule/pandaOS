import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { HDR_CITY } from './environmentFiles';

// Dit component laadt daadwerkelijk de auto in
const Model = () => {
  // Let op: zorg dat dit pad exact overeenkomt met je public folder!
  const { scene } = useGLTF('/models/car.glb'); 
  
  return (
    <primitive 
      object={scene} 
      // Afhankelijk van hoe groot het model is gemaakt door de ontwerper, 
      // moet je de scale misschien aanpassen (bijv 0.5 of juist 10)
      scale={1.2} 
      position={[0, -1, 0]} 
      // Draai de auto een beetje zodat je hem schuin van boven/achteren ziet
      rotation={[0.2, Math.PI / 4, 0]} 
    />
  );
};

const CarModel: React.FC = () => {
  return (
    <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
      {/* Zorgt voor mooie realistische reflecties op de auto */}
      <Environment files={HDR_CITY} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      
      {/* Suspense zorgt ervoor dat de app niet crasht tijdens het inladen van de 5MB file */}
      <Suspense fallback={null}>
        <Model />
        {/* Voegt een mooie schaduw onder de auto toe */}
        <ContactShadows position={[0, -1.01, 0]} opacity={0.5} scale={10} blur={2} far={4} />
      </Suspense>

      {/* Optioneel: Laat de gebruiker de auto ronddraaien met de muis/vinger */}
      <OrbitControls enableZoom={false} enablePan={false} maxPolarAngle={Math.PI / 2} minPolarAngle={0} />
    </Canvas>
  );
};

export default CarModel;